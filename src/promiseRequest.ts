import request = require("request");

export function promiseRequest(url : string) : Promise<string>{
    return new Promise((a,r)=>{
        request(url, (error : any, response : any, body : string) => {
            if(error) r(error);
            else a(body);
        });
    });
}