/**
 * Sanitized Deepak QA candidate fixture for committed automated tests.
 * Never include real personal phone/email here.
 */
export const DEEPAK_QA_SANITIZED = {
  name: "Deepak QA Candidate",
  location: "San Antonio, Texas",
  phone: "+1 202-555-0147",
  email: "deepak.qa@example.test",
  linkedIn: "https://example.test/deepak-qa",
  titleDefault: "Software Engineer",
  summary:
    "Software Engineer with 5+ years of experience developing AI/ML platforms, distributed backend services, cloud-native applications and full-stack products.",
  experience: [
    {
      company: "USAA",
      title: "Software Engineer",
      location: "San Antonio, Texas",
      startDate: "January 2024",
      endDate: "Present",
      technologies: ["Python", "PyTorch", "Hugging Face", "OpenSearch", "AWS", "EKS", "LangGraph", "FastAPI", "React", "TypeScript"],
      claims: [
        "Developed production inference and similarity-search services using Python, C++, PyTorch, Hugging Face and OpenSearch on AWS.",
        "Improved inference latency by approximately 40% and increased throughput by approximately 3.5 times.",
        "Evaluated the RAG pipeline against approximately 500 question-and-answer examples.",
        "Reduced response latency from approximately 2.1 seconds to 820 milliseconds.",
        "Reduced measured hallucination rate from approximately 11% to below 2%.",
        "Developed LangGraph-based retrieval and synthesis workflows.",
        "Reduced incident investigation time from approximately three hours to approximately 45 minutes.",
        "Supported SageMaker fine-tuning and improved model accuracy by approximately 25%.",
        "Improved user interaction latency by approximately 28%.",
        "Helped prevent approximately 45% of regressions through automated testing.",
        "Led and mentored an eight-member engineering team.",
      ],
    },
    {
      company: "Dell Technologies",
      title: "Software Engineer",
      location: "Bengaluru, India",
      startDate: "September 2020",
      endDate: "December 2022",
      technologies: ["Java", "Spring Boot", "React", "Kafka", "PostgreSQL", "Redis", "AWS", "Docker", "Kubernetes"],
      claims: [
        "Developed enterprise applications using Java, Spring Boot, REST APIs, React, TypeScript and relational databases.",
        "Built and maintained microservices and event-driven services using Kafka.",
      ],
    },
  ],
  education: [
    {
      school: "Illinois Institute of Technology",
      location: "Chicago, Illinois",
      degree: "Master of Science in Information Technology and Management",
      startDate: "January 2023",
      endDate: "May 2024",
    },
  ],
  certifications: [
    "AWS Certified Machine Learning Engineer – Associate",
    "NVIDIA-Certified Professional: Agentic AI",
  ],
  projects: [
    {
      name: "Compliance Copilot",
      technologies: ["Python", "FastAPI", "RAG", "LangGraph", "Hugging Face", "OpenSearch", "FAISS", "React", "TypeScript"],
    },
    {
      name: "Real-Time Ride Platform",
      technologies: ["Java", "Spring Boot", "Kafka", "WebSockets", "Redis", "PostgreSQL", "React", "TypeScript", "Docker"],
    },
  ],
  unsupportedTechnologies: ["JAX", "Google TPU"],
  uncertainTechnologies: ["NVIDIA Triton", "AWS Trainium"],
  jobOnlyTechnologies: ["vLLM", "Ray"],
  targetJob: {
    company: "Asteria AI Systems",
    role: "Senior AI Platform Engineer",
    location: "Remote, United States",
    url: "https://example.com/jobs/senior-ai-platform-engineer",
    description: `Asteria AI Systems is seeking a Senior AI Platform Engineer to build reliable generative-AI and machine-learning infrastructure. The engineer will develop Python services, scalable inference APIs, retrieval-augmented generation systems and evaluation pipelines.

Responsibilities include building services with Python, PyTorch, Hugging Face and FastAPI; deploying workloads using AWS, Docker and Kubernetes; operating vector search with OpenSearch or FAISS; developing agentic workflows; designing observability, model evaluation and guardrail systems; and collaborating across product and infrastructure teams.

Required qualifications include production experience with Python, distributed systems, REST APIs, AWS, Kubernetes, PyTorch, RAG, vector databases, CI/CD, automated testing and operational monitoring.

Preferred qualifications include vLLM, Ray, NVIDIA Triton, JAX, TPU infrastructure, Go, large-scale model training and GPU inference optimization.`,
  },
} as const;

export type DeepakQaSanitized = typeof DEEPAK_QA_SANITIZED;
