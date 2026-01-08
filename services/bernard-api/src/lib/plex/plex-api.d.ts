declare module "plex-api" {
  interface PlexOptions {
    hostname: string;
    port?: number;
    https?: boolean;
    token?: string;
    username?: string;
    password?: string;
    timeout?: number;
    authenticator?: PlexAuthenticator;
    responseParser?: (response: any, body: any) => Promise<any>;
    requestOptions?: Record<string, unknown>;
    options?: {
      identifier?: string;
      product?: string;
      version?: string;
      device?: string;
      deviceName?: string;
      platform?: string;
      platformVersion?: string;
    };
    managedUser?: {
      name: string;
      pin?: string;
    };
  }

  interface PlexAuthenticator {
    initialize?: (plexApi: PlexAPI) => void;
    authenticate: (
      plexApi: PlexAPI,
      callback: (error: Error | null, token: string | null) => void,
    ) => void;
  }

  interface PlexQueryOptions {
    uri: string;
    extraHeaders?: Record<string, string>;
    method?: string;
    parseResponse?: boolean;
  }

  interface PlexResponse {
    _children?: any[];
    MediaContainer?: {
      machineIdentifier?: string;
      Server?: any[];
      Directory?: any[];
      Metadata?: any[];
      Hub?: any[];
      [key: string]: any;
    };
    [key: string]: any;
  }

  class PlexAPI {
    constructor(options: string | PlexOptions);

    getHostname(): string;
    getPort(): number;
    getIdentifier(): string;

    query(options: string | PlexQueryOptions): Promise<PlexResponse>;
    postQuery(options: string | PlexQueryOptions): Promise<PlexResponse>;
    putQuery(options: string | PlexQueryOptions): Promise<PlexResponse>;
    deleteQuery(options: string | PlexQueryOptions): Promise<void>;
    perform(options: string | PlexQueryOptions): Promise<void>;
    find(
      options: string | PlexQueryOptions,
      criterias?: Record<string, string>,
    ): Promise<any[]>;
  }

  export = PlexAPI;
}
