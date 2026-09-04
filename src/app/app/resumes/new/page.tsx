import { GenerateForm } from "@/components/resumes/generate-form";

export default function NewResumePage() {
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-medium text-accent">Tailored resume</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Start with a job</h1>
      </div>
      <GenerateForm />
    </div>
  );
}
