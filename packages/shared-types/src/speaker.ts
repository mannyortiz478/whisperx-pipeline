export interface Speaker {
  speaker_id:      string;
  original_label:  string;
  display_name:    string;
}

export interface RenameSpeakerRequest {
  display_name: string;
}

export interface RenameSpeakerResponse {
  speaker_id:    string;
  display_name:  string;
  updated_at:    string;
}
