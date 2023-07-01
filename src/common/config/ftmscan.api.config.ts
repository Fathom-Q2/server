export interface FTMscanApiConfig {
  url: string;
  apiKey: string;
}

export default () =>
  ({
    FTMscanApi: {
      url: process.env.FATHOMSCAN_API_URL,
      apiKey: process.env.FATHOMSCAN_API_KEY,
    }, 
  } as { FTMscanApi: FTMscanApiConfig });


