
declare var SpotifyWebApi:any;


export class ArtistInfoApi {
    // credentials are optional
    spotifyApi = new SpotifyWebApi({
        clientId: '',
        clientSecret: '',
        redirectUri: 'https://api.soundshed.com/v1/spotifycallback'
    });

    apiToken=null;
    
    async search(query: string) {

        if (!this.apiToken){
            // Get an access token and 'save' it using a setter

            await new Promise((resolve,reject)=>{
                this.spotifyApi.clientCredentialsGrant().then(
                    (data)=> {
                      console.log('The access token is ' + data.body['access_token']);
                      this.apiToken=data.body['access_token'];
                      this.spotifyApi.setAccessToken(data.body['access_token']);
                      resolve(this.apiToken);
                    },
                    (err) =>{
                      console.log('Something went wrong!', err);

                      reject(err);
                    }
                  );
            });

        }

        return new Promise((resolve, reject) => {

            this.spotifyApi.searchArtists(query)
                .then(function (data) {
                    console.log('Search artists by '+query, data.body);
                    resolve(data.body);
                }, function (err) {
                    console.error(err);
                    resolve(err);
                });

        });
    }
}

export default ArtistInfoApi;