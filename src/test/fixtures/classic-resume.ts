import { buildResumeDocument } from "@/lib/resume-document";

/** Synthetic identities and accomplishments only; never a customer's uploaded résumé. */
export function classicResumeFixture(long = false) {
  const bullet = (text: string) => ({ text });
  const responsibilities = [
    "Built Python and PostgreSQL reporting services for internal operations teams.",
    "Implemented API contract checks and documented incident recovery procedures.",
    "Partnered with product and support teams to improve the account setup experience.",
  ];
  const sections = [
    { type: "summary", title: "Professional Summary", order: 0, content: "Software engineer building reliable services, clear interfaces, and practical tools for operations teams. Experienced in Python, TypeScript, PostgreSQL, and collaborative delivery." },
    { type: "experience", title: "Professional Experience", order: 1, items: [
      { heading: "Harbor Systems", subheading: "Software Engineer", location: "Chicago, IL", dates: "Jun 2022 – Present", bullets: (long ? Array.from({ length: 55 }, (_, i) => `${responsibilities[i % 3]} Documented delivery milestone ${i + 1} and its operational acceptance criteria.`) : responsibilities).map(bullet) },
      { heading: "Northwind Analytics", subheading: "Associate Software Engineer", location: "Austin, TX", dates: "Aug 2020 – May 2022", bullets: ["Maintained ingestion jobs and validation reports for the customer analytics platform.", "Added regression coverage for duplicate records and interrupted batch imports."].map(bullet) },
    ] },
    { type: "projects", title: "Project Experience", order: 2, items: [
      { heading: "Community Resource Directory", subheading: "Volunteer developer", dates: "2023 – 2024", bullets: [bullet("Created an accessible directory with search, volunteer editing, and verified contact links.")] },
      { heading: "Dataset Quality Explorer", bullets: [bullet("Built a local profiling tool to inspect missing values and inconsistent date formats.")] },
    ] },
    { type: "skills", title: "Technical Skills", order: 3, bullets: [bullet("Languages: Python, TypeScript, SQL"), bullet("Tools and platforms: PostgreSQL, Git, Docker, Linux")] },
    { type: "education", title: "Education", order: 4, items: [
      { heading: "Lakeside Institute of Technology", subheading: "Master of Science in Computer Science", dates: "2020 – 2022", location: "Chicago, IL", bullets: [] },
      { heading: "Valley State University", subheading: "Bachelor of Science in Information Systems", dates: "2016 – 2020", location: "Austin, TX", bullets: [] },
    ] },
    { type: "certifications", title: "Certifications", order: 5, content: "Cloud Practitioner | Accessible Web Development" },
    { type: "publications", title: "Publications", order: 6, items: [
      { heading: "Practical Data Validation", subheading: "Jordan Lee and Sam Rivera · Engineering Practice Review", dates: "2024", bullets: [bullet("A case study in schema evolution and recoverable imports. https://example.org/papers/validation")] },
    ] },
  ];
  return buildResumeDocument({ candidateName: "Jordan Lee", role: "Target Role", company: "Target Company Must Not Appear", contact: {
    email: "jordan.lee@example.com", phone: "+1 312 555 0192", location: "Chicago, IL",
    linkedIn: "linkedin.com/in/jordan-example", github: "github.com/jordan-example", portfolio: "https://jordan.example.org",
  }, sections });
}
