# overseerr tools

develop several tools to connect with my overseerr instance

## tools

- **find_media_status({type: movie | show, filter: string (regex)})**: search for movies/shows & list status (requested, in progress, in-library, etc)
- **request_media({type: movie | show, media: string (id), is4k: boolean, seasons: number[]})**: request a movie or show (optionally also request it in 4k, specify a season)
- **list_media_requests({limit: number, offset: number, filter: string (regex)})**: list media requests by recency (offset position + limit) includes id, title, status, requested at, completed at, etc
- **cancel_media_request({request: string (id)})**: cancel a request by id
- **report_media_issue({media: string (id), comment: string})**: report media as missing or broken with a message

## API

[documentation](https://api-docs.overseerr.dev)

## notes

- sign in with the plex token we already track.
- settings to configure overseerr should appear in auth/services
- follow existing patterns: look at `play_media_tv` and `search_media` and the home-assistant tools for examples of how to share code properly in `@/lib`
