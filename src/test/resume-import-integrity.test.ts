import { describe, expect, it } from "vitest";
import { normalizeResumeText } from "../../server/modules/resumes/text-extractor";
import { onboardingStepDataSchema } from "../../server/modules/profile/onboarding";
import { validateStepClient, emptyOnboardingForm } from "@/components/onboarding/types";

const WRAPPED = `ALEX RIVERA | Platform Mechanic
555-010-3344 | alex.rivera.example@example.com

PROFESSIONAL EXPERIENCE
Sr Java Full Stack Developer | Northbridge Mutual, Austin, TX, USA                                                             Jul 2025 - Present
- Engineered Java and Spring Boot microservices supporting property-insurance quoting, underwriting, policy
issuance, servicing, and renewal workflows used by member-service applications.
- Designed versioned REST and GraphQL APIs using OpenAPI specifications, standardized request validation,
pagination, error contracts, backward compatibility, and consumer-focused interface design.
Java Full Stack Developer | Lakeside Capital, Denver, CO, USA                                                      May 2023 - Jun 2025
- Developed Java and Spring Boot services supporting transaction processing, reconciliation, operational
controls, reference data, and internal financial-management workflows.
Java Developer | Contoso Labs, Hyderabad, India                                                                               Jun 2019 - Dec 2022
- Delivered Java and Spring Boot services for client-facing order management, account administration,
customer-service, and enterprise workflow applications.

EDUCATION
Master's | Information Systems Management | Cascadia Institute of Technology, Chicago, IL
Bachelor's | Computer Science | Lakeside University, Hyderabad, India

SKILLS
Java, Python, Spring Boot
`;

describe("resume import integrity", () => {
  it("does not promote wrapped bullet fragments into employment roles", () => {
    const extraction = normalizeResumeText(WRAPPED);
    expect(extraction.contact?.fullName).toBe("Alex Rivera");
    expect(extraction.contact?.headline).toMatch(/Platform Mechanic/i);
    expect(extraction.employment).toHaveLength(3);
    expect(extraction.employment.map((j) => j.company)).toEqual([
      "Northbridge Mutual",
      "Lakeside Capital",
      "Contoso Labs",
    ]);
    expect(extraction.employment[0]?.bullets.some((b) => b.includes("member-service applications"))).toBe(
      true,
    );
    expect(extraction.education[0]?.institution).toBe("Cascadia Institute of Technology");
    expect(extraction.education[0]?.field).toBe("Information Systems Management");
    expect(extraction.education[0]?.location).toBe("Chicago, IL");
  });

  it("allows draft autosave with many skills and missing location", () => {
    const parsed = onboardingStepDataSchema.safeParse({
      fullName: "Alex Rivera",
      email: "alex.rivera.example@example.com",
      phone: "555-010-3344",
      location: "",
      skills: Array.from({ length: 64 }, (_, i) => `Skill${i}`),
      employment: [
        {
          title: "Engineer",
          company: "Northbridge Mutual",
          bullets: ["Shipped services"],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("requires phone and current location to continue career step", () => {
    const form = {
      ...emptyOnboardingForm(),
      fullName: "Alex Rivera",
      email: "alex@example.com",
      phone: "",
      location: "",
      skills: ["Java"],
    };
    expect(validateStepClient(1, form, "ready_for_review")).toMatch(/phone/i);
    form.phone = "555-010-3344";
    expect(validateStepClient(1, form, "ready_for_review")).toMatch(/location/i);
    form.location = "Chicago, IL, USA";
    expect(validateStepClient(1, form, "ready_for_review")).toBeNull();
  });
});
