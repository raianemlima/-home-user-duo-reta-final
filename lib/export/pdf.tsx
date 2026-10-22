import { join } from "node:path";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { registerFonts } from "@/lib/export/fonts";
import type { ExportDoc } from "@/lib/export/model";
import { HIGHLIGHT_COLORS } from "@/lib/highlights/types";

const INK = "#29343A", MUTED = "#55646B", TERRACOTTA = "#AE4941", PAPER = "#F4F5F0";
const LOGO = join(process.cwd(), "public", "brand", "pena-terracota.png");
const swatch = (color: string) => HIGHLIGHT_COLORS.find((item) => item.key === color)?.swatch ?? "#DDDDDD";
// As fontes não têm emoji: fora do plano básico (e seletores de variação) sai só no PDF, nunca no banco.
const printable = (text: string) => text.replace(/[\u{10000}-\u{10FFFF}︎️‍]/gu, "");

const styles = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10.5, color: INK, paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, lineHeight: 1.45 },
  cover: { fontFamily: "Inter", backgroundColor: PAPER, color: INK, padding: 64, justifyContent: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 48 },
  brandWords: { fontFamily: "Montserrat", fontWeight: 700, color: TERRACOTTA, lineHeight: 1 },
  title: { fontFamily: "Montserrat", fontWeight: 700, fontSize: 30, marginBottom: 8 },
  subtitle: { fontSize: 15, color: MUTED, marginBottom: 24 },
  tocTitle: { fontFamily: "Montserrat", fontWeight: 700, fontSize: 14, marginTop: 24, marginBottom: 6 },
  discipline: { fontFamily: "Montserrat", fontWeight: 700, fontSize: 17, color: TERRACOTTA, marginBottom: 10 },
  topic: { fontWeight: 600, fontSize: 11, color: MUTED, marginTop: 10, marginBottom: 6 },
  item: { flexDirection: "row", marginBottom: 10 },
  bar: { width: 4, borderRadius: 2, marginRight: 10 },
  body: { flex: 1 },
  quote: { fontSize: 11 },
  note: { fontStyle: "italic", marginTop: 3 },
  meta: { fontSize: 8.5, color: MUTED, marginTop: 3 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED },
});

function Footer({ text }: { text: string }) {
  return <View style={styles.footer} fixed><Text>{text}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>;
}

export async function renderPdf(doc: ExportDoc): Promise<Uint8Array> {
  registerFonts();
  const pdf = <Document title={`${doc.title} · ${doc.subtitle}`} author="Cursos DUO" language="pt-BR">
    <Page size="A4" style={styles.cover}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt; o PDF traz o nome "CURSOS DUO" em texto ao lado. */}
      <View style={styles.brand}><Image src={LOGO} style={{ width: 56, height: 56 }} /><View><Text style={[styles.brandWords, { fontSize: 13 }]}>CURSOS</Text><Text style={[styles.brandWords, { fontSize: 24 }]}>DUO</Text></View></View>
      <Text style={styles.title}>{doc.title}</Text>
      <Text style={styles.subtitle}>{doc.subtitle} · gerado em {doc.generatedAt}</Text>
      <Text style={styles.tocTitle}>Sumário</Text>
      {doc.disciplines.map((discipline) => <Text key={discipline.title}>{discipline.title} — {discipline.topics.reduce((sum, topic) => sum + topic.items.length, 0)} trecho(s)</Text>)}
      <Footer text={doc.footer} />
    </Page>
    {doc.disciplines.map((discipline) => <Page key={discipline.title} size="A4" style={styles.page} wrap>
      <Text style={styles.discipline}>{printable(discipline.title)}</Text>
      {discipline.topics.map((topic) => <View key={topic.heading}>
        <Text style={styles.topic} minPresenceAhead={40}>{printable(topic.heading)}</Text>
        {topic.items.map((item, index) => <View key={index} style={styles.item} wrap={false}>
          <View style={[styles.bar, { backgroundColor: swatch(item.color) }]} />
          <View style={styles.body}>
            <Text style={styles.quote}>{printable(item.quote)}</Text>
            {item.note && <Text style={styles.note}>{printable(item.note)}</Text>}
            {item.orphanedNotice && <Text style={styles.meta}>{item.orphanedNotice}</Text>}
            <Text style={styles.meta}>{printable(item.reference)}{item.reviewed ? " · revisado" : ""}</Text>
          </View>
        </View>)}
      </View>)}
      <Footer text={doc.footer} />
    </Page>)}
  </Document>;
  return new Uint8Array(await renderToBuffer(pdf));
}
