// Shared technology keyword allowlist. Used by:
//   - Portfolio web fetcher (blog/website tech detection)
//   - Job-fit dashboard (JD skill extraction + classification vs CV)
//
// Keep tokens canonical-case-as-displayed; comparison is case-insensitive
// at the call site. Word-boundary regex protects against "React" matching
// inside "Reacted to feedback".

export const TECH_TOKENS = [
  // Languages
  "TypeScript", "JavaScript", "Python", "Rust", "Go", "Golang", "Java",
  "Kotlin", "Swift", "C++", "C#", "Ruby", "PHP", "Elixir", "Erlang", "Scala",
  "Haskell", "OCaml", "Clojure", "Bash", "Lua", "Nim", "Zig", "R", "Julia",
  "Perl", "Dart", "SQL", "PowerShell",
  // Web frameworks / libs
  "React", "Next.js", "Vue", "Nuxt", "Svelte", "SvelteKit", "Angular", "Solid",
  "Express", "Fastify", "NestJS", "Hono", "Rails", "Django", "Flask", "FastAPI",
  "Spring", "Spring Boot", "Phoenix", "Gin", "Echo", "Axum", "Actix", "Rocket",
  "Tailwind", "TailwindCSS", "Bootstrap", "Material UI", "shadcn",
  // Mobile
  "React Native", "Flutter", "SwiftUI", "Jetpack Compose", "Xamarin",
  // Data stores / streaming
  "PostgreSQL", "Postgres", "MySQL", "MariaDB", "MongoDB", "Redis", "Cassandra",
  "DynamoDB", "Elasticsearch", "OpenSearch", "ClickHouse", "DuckDB", "SQLite",
  "pgvector", "Snowflake", "BigQuery", "Redshift", "Neo4j", "InfluxDB",
  "Kafka", "RabbitMQ", "NATS", "Pulsar", "Kinesis", "EventBridge", "SQS",
  // Cloud platforms
  "AWS", "Azure", "GCP", "Google Cloud", "Cloudflare", "DigitalOcean",
  "Linode", "Hetzner", "Vercel", "Netlify", "Fly.io", "Render", "Heroku",
  // Containers + orchestration
  "Kubernetes", "K8s", "OpenShift", "Rancher", "Nomad",
  "Docker", "containerd", "Podman",
  // IaC + DevOps
  "Terraform", "OpenTofu", "Pulumi", "CloudFormation", "CDK",
  "Ansible", "Chef", "Puppet", "SaltStack",
  "Helm", "Kustomize", "ArgoCD", "Flux", "Tekton",
  "Vault", "Consul", "Boundary",
  "NixOS", "Nix",
  "GitHub Actions", "GitLab CI", "CircleCI", "Jenkins", "Buildkite", "Drone",
  // Observability + reliability
  "Prometheus", "Grafana", "Datadog", "New Relic", "Honeycomb", "Lightstep",
  "OpenTelemetry", "OTel", "Loki", "Tempo", "Jaeger", "Zipkin",
  "PagerDuty", "Opsgenie", "Splunk", "ELK", "Logstash",
  // ML / AI
  "PyTorch", "TensorFlow", "JAX", "Keras", "scikit-learn", "ONNX",
  "Hugging Face", "Transformers", "LangChain", "LlamaIndex",
  "LLM", "RAG", "vector database", "embeddings",
  "OpenAI", "Anthropic", "Claude", "Gemini", "Mistral", "Llama",
  // Frontend tooling / build
  "Vite", "webpack", "Rollup", "esbuild", "Turbopack", "Bun", "Deno", "Node.js",
  "pnpm", "npm", "yarn",
  // Other infrastructure
  "GraphQL", "gRPC", "REST", "OpenAPI", "Swagger",
  "WebAssembly", "WASM", "WebGPU", "WebRTC",
  "Linux", "BSD", "FreeBSD", "macOS",
  // Security
  "OAuth", "OIDC", "SAML", "JWT", "mTLS", "Zero Trust",
  "SOC 2", "ISO 27001", "GDPR", "HIPAA", "PCI DSS",
  // Methodology / role tokens (lightweight)
  "Agile", "Scrum", "Kanban", "DevOps", "SRE", "Platform Engineering",
  "Microservices", "Event-driven", "Serverless",
];

// Word-boundary regex per token. `\b` works on word chars only, which fails
// for tokens ending in non-word chars like `C++`, `C#`, `F#`. For those we
// substitute a non-word lookahead/-behind so adjacent text doesn't bleed in.
const TOKEN_REGEXES = TECH_TOKENS.map((t) => {
  const escaped = t.replace(/[.+#\-()*]/g, "\\$&").replace(/\s+/g, "\\s+");
  const startsWordChar = /^\w/.test(t);
  const endsWordChar = /\w$/.test(t);
  const left = startsWordChar ? "\\b" : "(?:^|[^A-Za-z0-9])";
  const right = endsWordChar ? "\\b" : "(?:$|[^A-Za-z0-9])";
  return {
    token: t,
    regex: new RegExp(`${left}${escaped}${right}`, "i"),
  };
});

export function extractTechTokens(text: string): string[] {
  if (!text || text.length === 0) return [];
  const haystack = text.slice(0, 30_000);
  const found: string[] = [];
  for (const { token, regex } of TOKEN_REGEXES) {
    if (regex.test(haystack) && !found.includes(token)) {
      found.push(token);
    }
  }
  return found;
}
