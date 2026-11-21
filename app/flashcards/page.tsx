import { FlashcardsView } from "@/components/flashcards/FlashcardsView";
import { FLASHCARD_EXAM_DATE } from "@/lib/flashcards/config";
import { studentSession } from "@/lib/reader/session";

export const dynamic = "force-dynamic";

export default async function FlashcardsPage() {
  await studentSession();
  return <div className="flash-root">
    <header className="grid-paper"><p className="eyebrow">Revisão espaçada</p><h1>Flashcards</h1></header>
    <FlashcardsView examDate={FLASHCARD_EXAM_DATE} />
  </div>;
}
