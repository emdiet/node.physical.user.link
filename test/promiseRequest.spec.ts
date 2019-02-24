import {expect} from "chai";
import {promiseRequest} from "../src/promiseRequest";


describe("request", ()=>{
    it("fetches an IP address from https://api.ipify.org", async ()=>{
        expect((await promiseRequest("https://api.ipify.org")).split('.').length).to.equal(4);
    }).timeout(5000);
});