export interface FTMscanApiConfig {
  url: string;
  apiKey: string;
}

export default () =>
  ({
    FTMscanApi: {
      url: "https://api.ftmscan.com/",//process.env.FATHOMSCAN_API_URL,
      apiKey: "H8BBEGVSMHM7Y965EFAX1U6PTJW5UH777R",//process.env.FATHOMSCAN_API_KEY,
    }, 
  } as { FTMscanApi: FTMscanApiConfig });
