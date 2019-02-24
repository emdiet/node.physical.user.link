import {expect} from "chai";
import {PhysicalNode} from "../src/PhysicalNode";
import {config} from "../config";

describe("PhysicalNode", ()=>{
    let physical : PhysicalNode;
    beforeEach(()=>{
        physical = new PhysicalNode();
    });
    afterEach(()=>{
        //physical.close();
    });
    it("builds a request", async ()=>{
        let req = await physical.request();
        expect(req.author).to.equal("physical-node");
        expect(req.supported[0]).to.equal("WebSocket-Provider");
        expect(req.body[0].length).to.be.greaterThan(config.keyLength+7);
    });
    it("responds to a WebSocket-Consumer Request", async ()=>{
        let res = await physical.respond({
            author: "",
            supported: ["WebSocket-Consumer"],
            body: [""]
        });
        expect(res.author).to.equal("physical-node");
        expect(res.protocol).to.equal("WebSocket-Provider");
        expect(res.body[0].length).to.be.greaterThan(config.keyLength+7);
    });
    it("responds to a WebSocket-Provider Request", async ()=>{
        let partner = new PhysicalNode();
        let res = await physical.respond(await partner.request());
        expect(res.author).to.equal("physical-node");
        expect(res.protocol).to.equal("WebSocket-Consumer");
    });
    it("opens on requester side", done =>{
        let partner = new PhysicalNode();
        physical.setOnOpen(()=>done());
        physical.request()
            .then(r => partner.respond(r))
            .then(r => physical.open(r));
    });
    it("opens on responder side", done =>{
        let partner = new PhysicalNode();
        partner.setOnOpen(()=>done());
        physical.request()
            .then(r => partner.respond(r))
            .then(r => physical.open(r));
    });
    it("messages go both ways", done =>{
        let partner = new PhysicalNode();
        physical.request()
            .then(r => partner.respond(r))
            .then(r => physical.open(r));
        physical.setOnOpen(()=>{
            physical.send("message from physical");
        });
        partner.setOnMessage((m)=>{
            console.log(m);
            expect(m).to.equal("message from physical");
            partner.send("message from partner");
        });
        physical.setOnMessage((m)=>{
            expect(m).to.equal("message from partner");
            done();
        })
    });
});