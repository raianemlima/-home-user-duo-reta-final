import { Suspense } from "react";
import { QuestionBank } from "@/components/questions/QuestionBank";

export const dynamic = "force-dynamic";

export default function QuestionsPage() {
  return <Suspense fallback={<p className="muted">Carregando…</p>}><QuestionBank /></Suspense>;
}
