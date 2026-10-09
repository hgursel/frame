export interface UserQuestion {
  id: string;
  header: string;
  question: string;
  multiple?: boolean;
  options: { label: string; description?: string }[];
}
export interface QuestionRequest {
  id: string;
  runId: string;
  questions: UserQuestion[];
}
export interface QuestionAnswer {
  questionId: string;
  selected: string[];
  text: string;
}
