import jwt_decode from "jwt-decode";
export interface UserRegistration {
    email: string;
    password: string;
}

export interface UserRegistrationResult {
    error: string;
    data: any;
}

export interface UserDetails {
    data: {
        userId: string;
    }
}
export interface Login {
    email: string;
    password: string;
}

export interface LoginResult {
    error: string;
    data: any;
}


export interface ToneFxParam {
    paramId: string;
    value: number;
    enabled: boolean;
    name?: string;
}
export interface ToneFx {
    /**  fx unit type being used */
    type: string;
    /**  patch name for this param collection */
    name?: string;
    /** set of parameters for this fx */
    params: ToneFxParam[];
    /** toggle this fx off/on */
    enabled: boolean;
}

export interface Tone {
    toneId: string;
    userId: string;
    deviceType: string;
    categories: string[];
    artists: string[];
    fx: ToneFx[];
    name: string;
    description: string;
    version: string;
    bpm: number;
    timeSig: string;
    schemaVersion: string;
    datecreated: Date;
}

export interface ActionResult<T> {
    completedOk: boolean;
    message: string;
    result?: T;
}

export interface UserInfo {
    id: string;
    name: string;
}

export class SoundshedApi {
 
    baseUrl: string = "https://api.soundshed.com/app/v1/" //"http://localhost:3000/api/v1/";
    currentToken: string;


    constructor() {
        let authToken = localStorage.getItem("_authtoken");
        if (authToken) {
            this.currentToken = authToken;
        }
    }

    getCurrentUserInfo(): UserInfo {
        if (this.currentToken) {
            let decoded = <any>jwt_decode(this.currentToken);
            return {
                id: decoded.id,
                name: decoded.name
            };

        } else {
            return null;
        }
    }
    
    isUserSignedIn() {
        if (this.currentToken) {
            return true;
        } else {
            return false;
        }
    }

    signOut() {
       this.currentToken=null;
       localStorage.removeItem("_authtoken");
    }

    async registerUser(registration: UserRegistration): Promise<ActionResult<UserRegistrationResult>> {

        let url = this.baseUrl + "user/register";
        let response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(registration) });
        let result = await <UserRegistrationResult><any>response.json();

        if (result.error == null) {
            return { completedOk: true, message: "OK", result: result };
        } else {
            return {
                completedOk: false, message: result.error
            };

        }
    }

    async login(loginDetails: Login): Promise<ActionResult<LoginResult>> {

        let url = this.baseUrl + "user/login";
        let response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginDetails) });
        let result = await <LoginResult><any>response.json();

        if (result.error == null) {
            this.currentToken = result.data.token;
            localStorage.setItem("_authtoken", this.currentToken);


            return { completedOk: true, message: "OK", result: result };
        } else {
            return {
                completedOk: false, message: result.error
            };

        }
    }

    async updateTone(tone: Tone): Promise<ActionResult<any>> {

        let url = this.baseUrl + "tones/upload";
        let response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.currentToken}` }, body: JSON.stringify(tone) });
        let result = await <any>response.json();

        if (result.error == null) {

            return { completedOk: true, message: "OK", result: result };
        } else {
            return {
                completedOk: false, message: result.error
            };

        }
    }

    async getTones(): Promise<ActionResult<Tone[]>> {
        let url = this.baseUrl + "tones/";

        let response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
        let result = await <any>response.json();

        if (result.error == null) {
            return { completedOk: true, message: "OK", result: result.data.tones };
        } else {
            return {
                completedOk: false, message: result.error
            };

        }
    }
}