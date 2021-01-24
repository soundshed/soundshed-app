import { SparkAPI } from "../devices/spark/sparkAPI";

let api = new SparkAPI();

api.login("","").then(async result=> {

    let user= await api.getUserInfo();

    console.log(user);
})