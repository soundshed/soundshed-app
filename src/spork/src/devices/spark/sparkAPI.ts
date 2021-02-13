const fetch = require('node-fetch');


export interface PGPresetQuery {
    preset_for?: string;
    license_tier?: string;
    keyword?: string;
    category?: string;
    page?: number;
    page_size?: number;
    order?: string;
    tag?: string;
}
export class SparkAPI {

    public access_token = "";
    public userInfo = null;


    public presetQueryParams: PGPresetQuery = {
        "preset_for": "spark",  // spark, jamup, bias, fx2
        "license_tier": null,
        "keyword": null,
        "category": null,
        "page": 1,
        "page_size": 20,
        "order": "latest", //latest,popular, alphabet
        "tag": null
    }

    api_base = "https://api.positivegrid.com/v2"

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

    async getToneCloudPresets(query: PGPresetQuery) {

        let queryParams = Object.assign(this.presetQueryParams, query);

        this.presetQueryParams = queryParams;

        if (this.presetQueryParams.keyword=="") this.presetQueryParams.keyword=null;
        // get preset results
        let params = "?";

        for (const [key, value] of Object.entries(this.presetQueryParams)) {
            if (value != null) {
                params += `${key}=${value}&`;
            }
        }
        params = params.substr(0, params.length - 1);

        let url = this.api_base + "/preset" + params;

        let response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        let data = <any>response.json();

        return data;
    }

    async getToneCloudPresetsCreatedByUser(userId:string, page=1, page_size=32) {

        //https://api.positivegrid.com/v2/user_create/4fa1ffb3727a300001000000?page=1&page_size=12&preset_for=fx2
        let url =`${this.api_base}/user_create/${userId}?page=${page}&page_size=${page_size}&preset_for=spark`;
        console.log(url);

        let response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        let data = <any>response.json();

        return data;
    }

    async getToneCloudPreset(id) {
        // get preset info
        let url = this.api_base + "/preset/" + id;

        //post to API as JSON
        let response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            body: null, credentials: 'include'
        });
        let data = <any>response.json();

        return data;
        // example json response: 
    }


}