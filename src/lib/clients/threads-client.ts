interface ThreadsPostResponse {
  id: string;
}

interface ThreadsMediaContainer {
  id: string;
  status: string;
}

interface ThreadsInsights {
  data: Array<{
    name: string;
    period: string;
    values: Array<{ value: number }>;
  }>;
}

export class ThreadsClient {
  private accessToken: string;
  private userId: string;
  private baseUrl = "https://graph.threads.net/v1.0";

  constructor() {
    this.accessToken = process.env.THREADS_ACCESS_TOKEN || "";
    this.userId = process.env.THREADS_USER_ID || "";
  }

  // Step 1: Create media container
  private async createMediaContainer(text: string): Promise<string> {
    const params = new URLSearchParams({
      media_type: "TEXT",
      text: text,
      access_token: this.accessToken,
    });

    const response = await fetch(`${this.baseUrl}/${this.userId}/threads?${params}`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Threads create container error: ${response.status} - ${error}`);
    }

    const data: ThreadsMediaContainer = await response.json();
    return data.id;
  }

  // Step 2: Check container status
  private async checkContainerStatus(containerId: string): Promise<string> {
    const params = new URLSearchParams({
      fields: "status",
      access_token: this.accessToken,
    });

    const response = await fetch(`${this.baseUrl}/${containerId}?${params}`);

    if (!response.ok) {
      throw new Error(`Threads status check error: ${response.status}`);
    }

    const data: ThreadsMediaContainer = await response.json();
    return data.status;
  }

  // Step 3: Publish the container
  private async publishContainer(containerId: string): Promise<string> {
    const params = new URLSearchParams({
      creation_id: containerId,
      access_token: this.accessToken,
    });

    const response = await fetch(`${this.baseUrl}/${this.userId}/threads_publish?${params}`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Threads publish error: ${response.status} - ${error}`);
    }

    const data: ThreadsPostResponse = await response.json();
    return data.id;
  }

  // Main method to post a thread
  async postThread(text: string): Promise<{ id: string }> {
    // Step 1: Create container
    const containerId = await this.createMediaContainer(text);

    // Step 2: Wait for processing (poll status)
    let status = "IN_PROGRESS";
    let attempts = 0;
    const maxAttempts = 10;

    while (status === "IN_PROGRESS" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      status = await this.checkContainerStatus(containerId);
      attempts++;
    }

    if (status !== "FINISHED") {
      throw new Error(`Threads container failed: ${status}`);
    }

    // Step 3: Publish
    const postId = await this.publishContainer(containerId);

    return { id: postId };
  }

  // Get insights for a thread post
  async getThreadInsights(
    threadId: string
  ): Promise<{
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    views: number;
  } | null> {
    const params = new URLSearchParams({
      metric: "likes,replies,reposts,quotes,views",
      access_token: this.accessToken,
    });

    const response = await fetch(`${this.baseUrl}/${threadId}/insights?${params}`);

    if (!response.ok) {
      if (response.status === 404) return null;
      const error = await response.text();
      throw new Error(`Threads insights error: ${response.status} - ${error}`);
    }

    const data: ThreadsInsights = await response.json();

    const metrics: Record<string, number> = {};
    for (const item of data.data) {
      metrics[item.name] = item.values[0]?.value || 0;
    }

    return {
      likes: metrics.likes || 0,
      replies: metrics.replies || 0,
      reposts: metrics.reposts || 0,
      quotes: metrics.quotes || 0,
      views: metrics.views || 0,
    };
  }

  // Get user profile info
  async getProfile(): Promise<{
    id: string;
    username: string;
    threadsProfilePictureUrl: string;
    threadsBiography: string;
  } | null> {
    const params = new URLSearchParams({
      fields: "id,username,threads_profile_picture_url,threads_biography",
      access_token: this.accessToken,
    });

    const response = await fetch(`${this.baseUrl}/me?${params}`);

    if (!response.ok) {
      return null;
    }

    return response.json();
  }
}

export const threadsClient = new ThreadsClient();

