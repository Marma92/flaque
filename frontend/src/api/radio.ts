import type { RadioCreateResponse, RadioQueueResponse, RadioStateResponse } from "../types";
import { requestJson } from "./client";

export async function createRadioStation(): Promise<RadioCreateResponse> {
  return requestJson<RadioCreateResponse>("/api/radio/create", {
    method: "POST"
  });
}

export async function getRadioState(): Promise<RadioStateResponse> {
  return requestJson<RadioStateResponse>("/api/radio/state");
}

export async function getRadioQueue(): Promise<RadioQueueResponse> {
  return requestJson<RadioQueueResponse>("/api/radio/queue");
}

export async function rebuildRadioStation(stationId: string): Promise<RadioCreateResponse> {
  return requestJson<RadioCreateResponse>(`/api/radio/rebuild/${encodeURIComponent(stationId)}`, {
    method: "POST"
  });
}
