import {ACK, Physical, SYNQ} from "physical";
import {promiseRequest} from "./promiseRequest";
import {config} from "../config";

const WebSocket = require("ws");
const net = require("net");
const crypto = require("crypto");

enum State{
    EMPTY,
    INITIATED,
    RESPONDED,
    FINALIZING,
    OPEN,
    CLOSED
}

export class PhysicalNode implements Physical{

    private static port : Promise<number>;
    private static host : Promise<string>;
    private static server : any;
    private static initialized = false;
    private static pendingConnections : ( (ws : WebSocket)=>void )[] = [];

    private readonly key = crypto.randomBytes(config.keyLength).toString('hex');
    private state = State.EMPTY;

    private onMessage = ( str : string ) => { console.warn("onmessage not set!") };
    private onOpen = () => { console.warn("onOpen not set!") };
    private onClose = () => { console.warn("onClose not set!") };

    private socket : WebSocket = null as any;


    close(): void {
        if(this.state != State.CLOSED) this.onClose();
        this.state = State.CLOSED;
        delete PhysicalNode.pendingConnections[this.key];
        this.socket && this.socket.close();
    }

    open(ack: ACK): void {
        if(this.state != State.INITIATED) throw("wrong state exception");
        this.state = State.FINALIZING;
        if(!this.socket) {
            this.buildConnectionHandler(config.pendingConnectionTimeout, true);
        }else{
            this.openFinalizeHandshake();
        }
    }

    private openFinalizeHandshake(){
        this.socket.send("RFT"); // ready for transmission
        this.state = State.OPEN;
        this.onOpen();
    }

    private buildURI(){
        let self = this;
        return Promise.all([PhysicalNode.host, PhysicalNode.port]).then(res =>
            "ws://" + res[0] + ":" + res[1] + "/" + self.key
        )
    }

    private buildConnectionHandler(timeout = 0, override = false){
        let self = this;
        if(!override && PhysicalNode.pendingConnections[self.key])
            throw("key already in use");

        PhysicalNode.pendingConnections[self.key] = (ws : WebSocket) => {
            self.socket = ws;
            (self.socket as any).on('message', (message : string) => {
                self.onMessage(message);
            });
            delete PhysicalNode.pendingConnections[self.key];
            self.peerReady();
        };

        if(timeout) setTimeout(()=> {
            if(PhysicalNode.pendingConnections[self.key])
                self.close();
        }, timeout)
    }

    private peerReady(){
        switch (this.state) {
            case State.CLOSED: this.socket.close(); break;
            case State.INITIATED: break; //this is fine. check in open if socket is avaolable
            case State.RESPONDED: break;
            case State.FINALIZING: this.openFinalizeHandshake(); break;
            default: console.error("Peer ready but bad state: "+this.state)
        }
    }

    async request(): Promise<SYNQ> {
        if(this.state != State.EMPTY) throw("wrong state exception");
        this.state = State.INITIATED;

        this.buildConnectionHandler();

        return {
            author: "physical-node",
            supported: ["WebSocket-Provider", "WebSocket-Consumer"],
            body: [await this.buildURI(), ""]
        };
    }


    private async connectToWebSocket(url : string){
        let self = this;

        //check if host is trying to connect to itself
        let split = url.split(await PhysicalNode.host);
        if(split.length == 2)
            url = split[0] + "127.0.0.1" + split[1];

        this.socket = new WebSocket(url);
        this.socket.onmessage = (event : MessageEvent) => {
            if(event.data == "RFT"){
                self.socket.onmessage = (event2 : MessageEvent) => {
                    self.onMessage(event2.data);
                };
                self.state = State.OPEN;
                self.onOpen();
            }else{
                console.error("peer failed to honor contract");
                console.error("out of state message: "+event.data);
                self.close();
            }
        };
        this.socket.onopen = ()=>console.log("opening socket");
        this.socket.onclose = ()=>self.close();
    }

    async respond(synq: SYNQ): Promise<ACK> {
        if(this.state != State.EMPTY) throw("wrong state exception");
        this.state = State.RESPONDED;

        if(synq.supported.includes("WebSocket-Provider")){
            let url = synq.body[synq.supported.indexOf("WebSocket-Provider")];
            await this.connectToWebSocket(url); //could be run asynchronously
            return {
                author: "physical-node",
                protocol: "WebSocket-Consumer",
                body: [""]
            }
        }else if(synq.supported.includes("WebSocket-Consumer")){
            this.buildConnectionHandler();
            return {
                author: "physical-node",
                protocol: "WebSocket-Provider",
                body: [await this.buildURI()]
            }
        }else{
            throw "No Compatible Protocol";
        }
    }

    send(message: string): void {
        if(this.state != State.OPEN) throw("connection not open");
        try{
            this.socket.send(message);
        }catch (e) {
            this.close();
            throw("failed to send message");
        }
    }

    setOnClose(f: () => void): void {
        this.onClose = f;
    }

    setOnMessage(f: (message: string) => void): void {
        this.onMessage = f;
    }

    setOnOpen(f: () => void): void {
        this.onOpen = f;
    }

    /**
     * initialize the webserver and handle incoming connections.
     * @param port
     * @private
     */
    public static __init(port = 0){
        if(PhysicalNode.initialized) throw "Already Initialized";
        PhysicalNode.initialized = true;

        PhysicalNode.host = promiseRequest("https://api.ipify.org");

        let server = net.createServer();
        PhysicalNode.port = Promise.resolve(config.port);
        PhysicalNode.server = new WebSocket.Server({port: config.port});

        //find the instance associated with the socket
        PhysicalNode.server.on('connection', (ws : any, req : any) => {
            let key =  req.url.slice(1);

            let callback = key ? PhysicalNode.pendingConnections[key] : undefined;
            if( !callback ) {
                ws.close(); // key not found
                return;
            }
            delete PhysicalNode.pendingConnections[key];
            callback(ws);
        });
    }
}

PhysicalNode.__init();
