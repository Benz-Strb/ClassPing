// รูปมาจาก URL ชั่วคราวของ Supabase ไม่ต้องผ่าน next/image
export function Photo({ src, size }: { src: string; size: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${size} rounded-lg bg-gray-100 object-cover`} />;
}
