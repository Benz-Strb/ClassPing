"use client";
import { useState } from "react";
import { AdminCatalogView } from "./admin-catalog-view";
import { CurriculumUpload } from "./curriculum-upload";
export function CurriculaWorkspace() {
  const [version, setVersion] = useState(0);
  return <div className="space-y-8"><CurriculumUpload onSaved={() => setVersion(value => value + 1)} /><AdminCatalogView key={version} kind="curricula" endpoint="/teacher/curricula" /></div>;
}
