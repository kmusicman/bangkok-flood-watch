// สายด่วน — ใช้ทั้ง bottom sheet และหน้า /links (CLAUDE.md ข้อ 6, 7)
export interface Hotline {
  number: string;
  name: string;
  note: string;
  urgent?: boolean;
  line?: { id: string; url: string };
}

export const HOTLINES: Hotline[] = [
  { number: '1784', name: 'ปภ. (กรมป้องกันและบรรเทาสาธารณภัย)', note: 'ขอความช่วยเหลือ / อพยพ — ทั้งประเทศ ตลอด 24 ชม.', urgent: true, line: { id: '@1784DDPM', url: 'https://line.me/R/ti/p/@1784DDPM' } },
  { number: '1669', name: 'สพฉ. เจ็บป่วยฉุกเฉิน', note: 'ผู้ป่วย / ผู้บาดเจ็บ ต้องการรถพยาบาล', urgent: true },
  { number: '1555', name: 'ศูนย์ กทม.', note: 'แจ้งน้ำท่วม / ต้นไม้ล้ม / ไฟดับ ในกรุงเทพฯ' },
  { number: '1586', name: 'กรมทางหลวง (ทล.)', note: 'สอบถามเส้นทางหลวงที่น้ำท่วม / ปิดการจราจร' },
  { number: '1146', name: 'กรมทางหลวงชนบท (ทช.)', note: 'สายทางชนบทที่ผ่านไม่ได้' },
  { number: '1130', name: 'การไฟฟ้านครหลวง (กฟน.)', note: 'ไฟรั่ว / ไฟดับ — กรุงเทพฯ นนทบุรี สมุทรปราการ' },
  { number: '1129', name: 'การไฟฟ้าส่วนภูมิภาค (กฟภ.)', note: 'ไฟรั่ว / ไฟดับ — จังหวัดอื่น' },
];

export const SAFETY_NOTE = 'ระวังไฟฟ้ารั่ว: อย่าเดินลุยน้ำใกล้เสาไฟ ตู้ควบคุมไฟ หรือปลั๊กที่จมน้ำ ถ้าน้ำเข้าบ้านให้ตัดเบรกเกอร์ก่อน';
