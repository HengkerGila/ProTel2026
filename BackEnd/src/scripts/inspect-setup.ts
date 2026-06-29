/**
 * Read-Only Setup & Infrastructure Inspection Script ("coba test lokal")
 * Mengecek keaktifan sub-block, siklus tanam, pematang, titik irigasi, jalur route, & output DSS.
 */
import 'dotenv/config';
import { eq, desc } from 'drizzle-orm';
import { db, testConnection } from '@/db/client';
import { 
  fields, subBlocks, cropCycles, embankments, irrigationPoints, 
  flowPaths, decisionJobs, irrigationRecommendations, irrigationRuleProfiles 
} from '@/db/schema';

async function inspectSetup() {
  console.log('\n🔍 Memeriksa koneksi ke Database PostgreSQL...');
  await testConnection();

  console.log('\n====================================================================');
  console.log('🏗️ LAPORAN AUDIT SETUP INFRASTRUKTUR & DSS: "coba test lokal"');
  console.log('====================================================================\n');

  try {
    const allFields = await db.select().from(fields);
    const targetField = allFields.find(f => f.name.toLowerCase().includes('coba test lokal'));

    if (!targetField) {
      console.log('❌ Lahan "coba test lokal" tidak ditemukan.');
      process.exit(0);
    }

    console.log(`🌾 Lahan Terpilih : "${targetField.name}" (ID: ${targetField.id})`);

    // 1. Audit Sub-Blocks & Status Penggunaannya (isActive)
    const fieldSubBlocks = await db.select().from(subBlocks).where(eq(subBlocks.fieldId, targetField.id));
    const activeSubBlocks = fieldSubBlocks.filter(sb => sb.isActive);
    console.log(`\n🧩 1. STATUS PENGGUNAAN SUB-BLOCKS:`);
    console.log(`   Total Petak Sawah : ${fieldSubBlocks.length} petak`);
    console.log(`   Petak Aktif       : ${activeSubBlocks.length} petak (100% ${activeSubBlocks.length === fieldSubBlocks.length ? 'Digunakan Semua ✅' : 'Sebagian Aktif ⚠️'})`);

    // 2. Audit Siklus Tanam Aktif (Crop Cycles)
    const cycles = await db.select().from(cropCycles).where(eq(cropCycles.fieldId, targetField.id));
    const activeCycles = cycles.filter(c => c.status === 'active' || c.status === 'in_progress');
    console.log(`\n🌱 2. SIKLUS TANAM (CROP CYCLES):`);
    console.log(`   Total Siklus Tercatat : ${cycles.length} siklus`);
    if (activeCycles.length > 0) {
      activeCycles.forEach(c => {
        console.log(`   ✅ Siklus ID: ${c.id.substring(0, 8)}... | Varietas: ${c.varietyName || 'Default'} | Fase: ${c.currentPhaseCode} (HST: ${c.currentHst}) | RuleProfile: ${c.ruleProfileId ? 'Terpasang ✅' : 'Kosong ❌'}`);
      });
    } else {
      console.log(`   ⚠️ Tidak ada siklus tanam berstatus 'active' saat ini. (Mungkin menggunakan default siklus sistem)`);
    }

    const profiles = await db.select().from(irrigationRuleProfiles);
    console.log(`\n📐 KETERSEDIAAN RULE PROFILES DI DATABASE: (${profiles.length} profil)`);
    profiles.slice(0, 3).forEach(rp => {
      console.log(`   - ID: ${rp.id} | Nama: "${rp.name}" | Batas Bawah: ${rp.awdLowerThresholdCm}cm | Target Atas: ${rp.awdUpperTargetCm}cm`);
    });

    // 3. Audit Infrastruktur Pematang (Embankments / Galengan)
    const fieldEmbankments = await db.select().from(embankments).where(eq(embankments.fieldId, targetField.id));
    console.log(`\n🧱 3. INFRASTRUKTUR PEMATANG (EMBANKMENTS):`);
    console.log(`   Total Pematang Terdaftar : ${fieldEmbankments.length} pematang`);
    if (fieldEmbankments.length > 0) {
      fieldEmbankments.slice(0, 5).forEach((e, idx) => {
        const conn = e.connectedSubBlocks || [];
        console.log(`   [${idx + 1}] "${e.name}" (Kode: ${e.code || 'N/A'}) | Menghubungkan ${conn.length} petak`);
      });
      if (fieldEmbankments.length > 5) console.log(`   ... dan ${fieldEmbankments.length - 5} pematang lainnya.`);
    } else {
      console.log(`   ⚠️ Belum ada pematang sawah yang digambar/didaftarkan untuk lahan ini.`);
    }

    // 4. Audit Titik Irigasi (Water Sources / Irrigation Points)
    const points = await db.select().from(irrigationPoints).where(eq(irrigationPoints.fieldId, targetField.id));
    console.log(`\n🚰 4. TITIK IRIGASI / SUMBER AIR (IRRIGATION POINTS):`);
    console.log(`   Total Titik Irigasi : ${points.length} titik`);
    if (points.length > 0) {
      points.forEach((p, idx) => {
        console.log(`   [${idx + 1}] "${p.name || 'Titik Tanpa Nama'}" | Tipe: ${p.pointType.toUpperCase()} | Melayani: ${(p.assignedSubBlocks || []).length} petak`);
      });
    } else {
      console.log(`   ⚠️ Belum ada titik irigasi khusus yang didaftarkan.`);
    }

    // 5. Audit Jalur Aliran Air (Flow Paths / Route Matrix)
    const paths = await db.select().from(flowPaths).where(eq(flowPaths.fieldId, targetField.id));
    console.log(`\n🌊 5. JALUR ALIRAN & ROUTING AIR (FLOW PATHS):`);
    console.log(`   Total Konfigurasi Flow Path : ${paths.length} rute aliran`);
    if (paths.length > 0) {
      paths.forEach((fp, idx) => {
        console.log(`   [${idx + 1}] Tipe Aliran: ${fp.flowType.toUpperCase()} | Status: ${fp.isActive ? 'Aktif ✅' : 'Non-aktif ❌'}`);
      });
    } else {
      console.log(`   ⚠️ Belum ada flow path khusus (sistem akan menggunakan kalkulasi rute natural/topografi).`);
    }

    // 6. Audit Kesiapan Modul Output DSS (Jobs & Recommendations)
    const jobs = await db.select().from(decisionJobs).where(eq(decisionJobs.fieldId, targetField.id)).orderBy(desc(decisionJobs.completedAt));
    const recs = await db.select().from(irrigationRecommendations).where(eq(irrigationRecommendations.fieldId, targetField.id));
    
    console.log(`\n🎯 6. KESIAPAN MODUL OUTPUT DSS:`);
    console.log(`   Total Riwayat Decision Jobs : ${jobs.length} siklus kalkulasi`);
    if (jobs.length > 0) {
      console.log(`   🕒 Job Terakhir ID: ${jobs[0].id} | Status: ${jobs[0].status.toUpperCase()} | Waktu: ${jobs[0].completedAt ? new Date(jobs[0].completedAt).toLocaleString('id-ID') : 'N/A'}`);
    }
    console.log(`   Total Rekomendasi Tersimpan : ${recs.length} komando rekomendasi di database`);

    const recTypes: Record<string, number> = {};
    recs.forEach(r => {
      recTypes[r.recommendationType] = (recTypes[r.recommendationType] || 0) + 1;
    });
    if (Object.keys(recTypes).length > 0) {
      console.log(`   Breakdown Tipe Rekomendasi  :`, recTypes);
    }

    console.log('\n====================================================================');
    console.log('✅ Audit Setup selesai (Read-Only).');
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal melakukan audit setup:', err);
    process.exit(1);
  }
}

inspectSetup();
