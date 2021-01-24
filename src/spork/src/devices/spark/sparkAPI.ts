const fetch = require('node-fetch');

export class SparkAPI {

    public access_token = "";
    public userInfo = null;

    api_base = "https://api.positivegrid.com/v2/"

    log(msg) {
        console.log(msg);
    }

    async login(user, pwd): Promise<boolean> {
        // perform login and get access token
        let url = this.api_base + "/auth";
        let payload = { "username": user, "password": pwd };

        //post to API as JSON
        let response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        let data = <any>response.json();

        if (data.success == true) {
            this.access_token = data.token;
            this.log(`Got access token: ${this.access_token}`);
            return true;
        } else {
            this.log(`Login failed: ${JSON.stringify(data)}`);
            return false;
        }

        // example json response: 
        /*
        // OK
        {
            "success": true,
            "token": "token.stuff>"
        }

        // bad password
        {
            "errorMessage": "unauthorized",
            "code": "USER_UNAUTHORIZED",
            "status": 401
        }
        */
    }

    async getUserInfo() {
        // get user info
        let url = this.api_base + "/user";

        //post to API as JSON
        let response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'JWT ' + this.access_token },
            body: null, credentials: 'include'
        });
        let data = <any>response.json();

        return data;
        // example json response: 
        /*
        {
            "success": true,
            "token": "token.stuff>"
        }
        */

        // edit profile: https://account.positivegrid.com/profile
    }

    async getToneCloudPresets() {
        // get user info
        let url = this.api_base + "/user";

        //post to API as JSON
        let response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'JWT ' + this.access_token },
            body: null, credentials: 'include'
        });
        let data = <any>response.json();

        return data;
        // example json response: 
    }
}