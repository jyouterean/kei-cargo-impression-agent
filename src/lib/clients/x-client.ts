import crypto from "crypto";

interface XApiConfig {
  bearerToken: string;
  oauth1?: {
    consumerKey: string;
    consumerSecret: string;
    accessToken: string;
    accessTokenSecret: string;
  };
}

interface TweetPublicMetrics {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
  impression_count?: number;
}

interface Tweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics: TweetPublicMetrics;
  non_public_metrics?: {
    impression_count: number;
    user_profile_clicks: number;
  };
  organic_metrics?: {
    impression_count: number;
    like_count: number;
    reply_count: number;
    retweet_count: number;
  };
}

interface User {
  id: string;
  username: string;
  public_metrics: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

interface SearchResponse {
  data?: Tweet[];
  includes?: {
    users?: User[];
  };
  meta?: {
    newest_id: string;
    oldest_id: string;
    result_count: number;
    next_token?: string;
  };
}

interface TweetResponse {
  data?: {
    id: string;
    text: string;
  };
  errors?: Array<{ message: string; code: number }>;
}

export class XClient {
  private config: XApiConfig;
  private baseUrl = "https://api.twitter.com/2";

  constructor() {
    this.config = {
      bearerToken: process.env.X_BEARER_TOKEN || "",
      oauth1: {
        consumerKey: process.env.X_OAUTH1_CONSUMER_KEY || "",
        consumerSecret: process.env.X_OAUTH1_CONSUMER_SECRET || "",
        accessToken: process.env.X_OAUTH1_ACCESS_TOKEN || "",
        accessTokenSecret: process.env.X_OAUTH1_ACCESS_TOKEN_SECRET || "",
      },
    };
  }

  // Generate OAuth 1.0a signature for posting
  private generateOAuth1Header(
    method: string,
    url: string,
    params: Record<string, string> = {}
  ): string {
    const oauth = this.config.oauth1!;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString("hex");

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: oauth.consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: timestamp,
      oauth_token: oauth.accessToken,
      oauth_version: "1.0",
    };

    // Combine all params for signature base
    const allParams = { ...params, ...oauthParams };
    const sortedParams = Object.keys(allParams)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
      .join("&");

    const signatureBase = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sortedParams),
    ].join("&");

    const signingKey = `${encodeURIComponent(oauth.consumerSecret)}&${encodeURIComponent(oauth.accessTokenSecret)}`;
    const signature = crypto
      .createHmac("sha1", signingKey)
      .update(signatureBase)
      .digest("base64");

    oauthParams.oauth_signature = signature;

    const headerParams = Object.keys(oauthParams)
      .sort()
      .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(", ");

    return `OAuth ${headerParams}`;
  }

  // Search recent tweets (for BuzzHarvester)
  async searchRecentTweets(
    query: string,
    options: {
      maxResults?: number;
      sinceId?: string;
      startTime?: string;
    } = {}
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({
      query: `${query} lang:ja -is:retweet`,
      "tweet.fields": "created_at,public_metrics,author_id",
      "user.fields": "public_metrics",
      expansions: "author_id",
      max_results: (options.maxResults || 100).toString(),
    });

    if (options.sinceId) {
      params.set("since_id", options.sinceId);
    }
    if (options.startTime) {
      params.set("start_time", options.startTime);
    }

    const response = await fetch(`${this.baseUrl}/tweets/search/recent?${params}`, {
      headers: {
        Authorization: `Bearer ${this.config.bearerToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`X API search error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Get own tweet metrics (for MetricsCollector)
  async getTweetMetrics(tweetId: string): Promise<Tweet | null> {
    const params = new URLSearchParams({
      "tweet.fields": "public_metrics,non_public_metrics,organic_metrics,created_at",
    });

    const url = `${this.baseUrl}/tweets/${tweetId}?${params}`;
    const authHeader = this.generateOAuth1Header("GET", `${this.baseUrl}/tweets/${tweetId}`);

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      const error = await response.text();
      throw new Error(`X API metrics error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data || null;
  }

  // Post a tweet
  async postTweet(text: string): Promise<TweetResponse> {
    const url = `${this.baseUrl}/tweets`;
    const authHeader = this.generateOAuth1Header("POST", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`X API post error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Get authenticated user info
  async getMe(): Promise<User | null> {
    const url = `${this.baseUrl}/users/me`;
    const params = new URLSearchParams({
      "user.fields": "public_metrics",
    });

    const authHeader = this.generateOAuth1Header("GET", url);

    const response = await fetch(`${url}?${params}`, {
      headers: {
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.data || null;
  }

  // Get rate limit status
  async getRateLimitStatus(): Promise<{
    remaining: number;
    reset: Date;
    limit: number;
  } | null> {
    // Rate limits are returned in response headers
    // This is a placeholder - actual implementation would track headers from API calls
    return null;
  }
}

export const xClient = new XClient();

