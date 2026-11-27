type CourseRow = { code: string; name: string; credits: string };
type Term = { title: string; courses: CourseRow[] };

export function readStudyPlan(content: string): Term[] | null {
  const terms: Term[] = [];
  for (const line of content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    if (/^ภาคเรียนที่\s*\d+\s*\/\s*\d{4}/u.test(line)) {
      terms.push({ title: line, courses: [] });
      continue;
    }
    if (line === "รหัสรายวิชา | ชื่อรายวิชา | หน่วยกิต") continue;
    const term = terms.at(-1);
    const course = line.match(/^([A-Z]{2,}\d{3,}[A-Z0-9]*) \| (.+?)(?: \| ([^|]+))?$/i);
    if (!term || !course) return null;
    term.courses.push({ code: course[1], name: course[2], credits: course[3] ?? "—" });
  }
  return terms.length && terms.every((term) => term.courses.length) ? terms : null;
}

export function CurriculumStudyPlan({ terms }: { terms: Term[] }) {
  return <div className="space-y-4">
    {terms.map(({ title, courses }, index) => (
      <details key={`${index}-${title}`} open={index === 0} className="overflow-hidden rounded-xl border border-[var(--cp-border)]">
        <summary className="cursor-pointer bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-800">
          {title} <span className="ms-2 font-normal">· {courses.length} รายวิชา</span>
        </summary>
        <table aria-label={title} className="min-w-0! text-sm">
          <thead>
            <tr>
              <th scope="col" className="px-2! py-2! text-start">รหัสวิชา</th>
              <th scope="col" className="px-2! py-2! text-start">ชื่อวิชา</th>
              <th scope="col" className="px-2! py-2! text-end">หน่วยกิต</th>
            </tr>
          </thead>
          <tbody>
            {courses.map(({ code, name, credits }, row) => (
              <tr key={`${code}-${row}`}>
                <td className="px-2! py-2! align-top font-medium text-blue-800 [overflow-wrap:anywhere]">{code}</td>
                <td className="px-2! py-2! align-top [overflow-wrap:anywhere]">{name}</td>
                <td className="px-2! py-2! text-end align-top tabular-nums">{credits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    ))}
  </div>;
}

export function CurriculumContent({ content }: { content: string }) {
  const terms = readStudyPlan(content);
  if (!terms) return <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-gray-600">{content}</p>;

  return <details className="rounded-lg border border-[var(--cp-border)] px-3">
    <summary className="cursor-pointer py-3 text-sm font-medium text-blue-700">
      ดูแผนการศึกษา · {terms.length} ภาคเรียน · {terms.reduce((total, term) => total + term.courses.length, 0)} รายวิชา
    </summary>
    <div className="pb-3"><CurriculumStudyPlan terms={terms} /></div>
  </details>;
}
