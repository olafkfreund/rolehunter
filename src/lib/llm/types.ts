export type Provider = "claude" | "gemini";

export interface CvJson {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experience?: Array<{
    company: string;
    title: string;
    start?: string;
    end?: string;
    location?: string;
    bullets: string[];
  }>;
  education?: Array<{
    institution: string;
    degree?: string;
    field?: string;
    start?: string;
    end?: string;
  }>;
  skills?: string[];
  projects?: Array<{ name: string; description: string; tech?: string[] }>;
  certifications?: string[];
  languages?: string[];
}

export interface JobInput {
  title: string;
  company: string;
  location?: string;
  description: string;
}

export interface MatchResult {
  score: number; // 0-100
  strengths: string[];
  gaps: string[];
  reasoning: string; // markdown
}

export interface RewriteResult {
  markdown: string;
  keywords: string[];
}

export interface LinkedInInput {
  headline: string;
  about: string;
  targetRole: string;
}

export interface LinkedInResult {
  score: number; // 0-100
  coverage: Record<string, boolean>; // keyword -> present
  suggestions: string; // markdown
  rewrittenHeadline?: string;
  rewrittenAbout?: string;
}

export interface CoverLetterInput {
  cv: CvJson;
  job: JobInput;
  profile: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedinUrl?: string | null;
  };
  templateBodyMd?: string;
}

export interface CoverLetterResult {
  markdown: string;
  keywords: string[];
}

export type FlashcardCategory =
  | "behavioral"
  | "role_specific"
  | "company_specific"
  | "technical";

export interface FlashcardOut {
  category: FlashcardCategory;
  question: string;
  answer: string;
  order: number;
}

export interface FeedbackEntry {
  jobTitle: string;
  company: string;
  stage: string;
  rejectionCategory?: string | null;
  rating?: number | null;
  whatWentWellMd?: string;
  whatWentBadlyMd?: string;
  whatToChangeMd?: string;
  recruiterVerbatim?: string | null;
  createdAt: string;
}

export interface FeedbackAnalysis {
  patternsMd: string;
  weakAreas: string[];
  strongAreas: string[];
  recommendations: string[];
}

export interface LinkedInImportResult {
  profile: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedinHeadline?: string;
    linkedinAbout?: string;
    summary?: string;
  };
  cv: CvJson;
}

export interface GapClusterMember {
  matchId: number;
  rawPhrase: string;
}

export interface GapCluster {
  canonicalName: string;
  normalizedKey: string;
  description: string;
  members: GapClusterMember[];
}

export interface GapCanonicalizeResult {
  clusters: GapCluster[];
}

export type LearningResourceKind = "docs" | "guide" | "reference" | "community";

export interface LearningResource {
  title: string;
  url: string;
  kind: LearningResourceKind;
  rationale: string;
}

export interface LearningResourcesResult {
  resources: LearningResource[];
}

export interface LlmProvider {
  name: Provider;
  extractCv(rawText: string): Promise<CvJson>;
  match(cv: CvJson, job: JobInput): Promise<MatchResult>;
  rewriteCv(cv: CvJson, job: JobInput): Promise<RewriteResult>;
  linkedinSeo(input: LinkedInInput): Promise<LinkedInResult>;
  generateCoverLetter(input: CoverLetterInput): Promise<CoverLetterResult>;
  generateFlashcards(cv: CvJson, job: JobInput): Promise<FlashcardOut[]>;
  analyzeFeedback(entries: FeedbackEntry[]): Promise<FeedbackAnalysis>;
  importLinkedInPdf(rawText: string): Promise<LinkedInImportResult>;
  canonicalizeGaps(input: GapClusterMember[]): Promise<GapCanonicalizeResult>;
  generateLearningResources(skill: string): Promise<LearningResourcesResult>;
}
