import youtubeSearch from "youtube-search";

export interface VideoSearchResult {
    url: string;
    itemId: string;
    datePublished: Date;
    channelId: string
    channelTitle: string;
    title: string;
    description: string;
    thumbnailUrl: string;
}
export class VideoSearchApi {

    async search(query: string) {

        var opts: youtubeSearch.YouTubeSearchOptions = {
            maxResults: 10,
            key: ""
        };

        let results = await youtubeSearch(query, opts,);
        let searchResults: VideoSearchResult[] = [];
        for (let r of results.results) {

            searchResults.push({
                url: r.link,
                itemId: r.id,
                datePublished: new Date(r.publishedAt),
                channelId: r.channelId,
                channelTitle: r.channelTitle,
                title: r.title,
                description: r.description,
                thumbnailUrl: r.thumbnails.medium.url

            })
        }
        return searchResults;
    }
}

export default VideoSearchApi;
