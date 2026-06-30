/**
 * Seed dummy data KHUSUS RAW SENSOR (Blackbox Testing Algoritma DSS AI Engine)
 * Memeriksa lahan "coba test lokal", mendeteksi sub-blocks, dan meng-inject telemetry bervariasi.
 */
import 'dotenv/config';
import { eq, desc, and, sql } from 'drizzle-orm';
import { db, testConnection } from '@/db/client';
import { 
  fields, subBlocks, devices, telemetryRecords, 
  irrigationRecommendations, decisionJobs, embankments, irrigationPoints
} from '@/db/schema';
import { randomUUID } from 'crypto';
import { buildFieldStates } from '@/modules/state-builder/state-builder.service';
import { runDecisionCycleForField } from '@/modules/decision-engine/engine-client.service';

async function seedSensorTest() {
  console.log('\n🔍 Memeriksa koneksi ke Database PostgreSQL...');
  await testConnection();
  console.log('✅ Koneksi Backend & Database Verified Connected!');

  console.log('\n====================================================================');
  console.log('🌱 TAHAP 1: INSPEKSI LAHAN & SUB-BLOCKS ("coba test lokal")');
  console.log('====================================================================');

  try {
    // 1. Cari lahan dengan nama "coba test lokal"
    const allFields = await db.select().from(fields);
    const targetField = allFields.find(f => f.name.toLowerCase().includes('coba test lokal'));

    if (!targetField) {
      console.log('❌ Lahan dengan nama "coba test lokal" tidak ditemukan di database.');
      console.log('\nDaftar lahan yang tersedia di database saat ini:');
      allFields.forEach(f => console.log(` 🔹 [ID: ${f.id}] -> "${f.name}"`));
      process.exit(1);
    }

    console.log(`📍 Lahan Terpilih : "${targetField.name}"`);
    console.log(`🔑 Field ID       : ${targetField.id}`);

    // 2. Ambil & Cek Jumlah Sub-blocks AKTIF untuk lahan tersebut
    const fieldSubBlocks = await db.select().from(subBlocks).where(
      and(eq(subBlocks.fieldId, targetField.id), eq(subBlocks.isActive, true))
    );
    if (!fieldSubBlocks.length) {
      console.log(`❌ Lahan "${targetField.name}" belum memiliki petak sawah aktif.`);
      process.exit(1);
    }

    console.log(`📊 Jumlah Sub-block Aktif Terdeteksi: ${fieldSubBlocks.length} petak sawah`);
    fieldSubBlocks.forEach((sb, index) => {
      console.log(`   ${index + 1}. Petak "${sb.code || 'Tanpa Kode'}" (ID: ${sb.id} | Luas: ${sb.areaM2} m²)`);
    });

    console.log('\n====================================================================');
    console.log('🚧 TAHAP 1.5: INJEKSI DATA MASTER TOPOGRAFI (PEMATANG & PINTU AIR)');
    console.log('====================================================================');

    // Hapus data uji coba pematang & titik irigasi lama agar bersih
    await db.delete(embankments).where(eq(embankments.fieldId, targetField.id));
    await db.delete(irrigationPoints).where(eq(irrigationPoints.fieldId, targetField.id));

    if (fieldSubBlocks.length >= 2) {
      // 1. Injeksi Pintu Irigasi Masuk (Source) di Petak pertama
      await db.insert(irrigationPoints).values({
        fieldId: targetField.id,
        name: 'Pintu Irigasi Inlet Utama',
        pointType: 'source',
        coordinatePoint: sql`ST_SetSRID(ST_MakePoint(106.8000, -6.2000), 4326)`,
        elevationM: '12.50',
        assignedSubBlocks: [fieldSubBlocks[0].id],
      });

      // 2. Injeksi Pintu Buangan Akhir (Drain) di Petak terakhir
      await db.insert(irrigationPoints).values({
        fieldId: targetField.id,
        name: 'Pintu Drainase Outlet Akhir',
        pointType: 'drain',
        coordinatePoint: sql`ST_SetSRID(ST_MakePoint(106.8050, -6.2050), 4326)`,
        elevationM: '8.00',
        assignedSubBlocks: [fieldSubBlocks[fieldSubBlocks.length - 1].id],
      });

      // 3. Injeksi Pematang sawah yang menghubungkan antar petak secara berturutan
      for (let i = 0; i < fieldSubBlocks.length - 1; i++) {
        const sb1 = fieldSubBlocks[i];
        const sb2 = fieldSubBlocks[i + 1];
        await db.insert(embankments).values({
          fieldId: targetField.id,
          name: `Pematang Antar Petak ${sb1.code || i+1} & ${sb2.code || i+2}`,
          code: `EMB_${i+1}_${i+2}`,
          polygonGeom: sql`ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(106.800 + ${i}*0.001, -6.200), ST_MakePoint(106.801 + ${i}*0.001, -6.200), ST_MakePoint(106.801 + ${i}*0.001, -6.201), ST_MakePoint(106.800 + ${i}*0.001, -6.201), ST_MakePoint(106.800 + ${i}*0.001, -6.200)])), 4326)`,
          elevationM: (11 - i * 0.5).toFixed(2),
          connectedSubBlocks: [sb1.id, sb2.id],
          isActive: true,
        });
      }
      console.log(`✅ Berhasil menyuntikkan 2 Pintu Air (Source & Drain) dan ${fieldSubBlocks.length - 1} Pematang Sawah!`);
    } else {
      console.log('⚠️ Jumlah petak kurang dari 2, melewati pembentukan relasi antar kotak.');
    }

    console.log('\n====================================================================');
    console.log('📡 TAHAP 2: INJEKSI DATA RAW SENSOR (TELEMETRY) YANG BERVARIASI');
    console.log('====================================================================');

    // Kumpulan variasi skenario level air agar pengujian DSS dinamis & leluasa
    const dynamicScenarios = [
      { wl: "-16.5", temp: "31.2", hum: "65.0", desc: "Sangat Kering (-16.5 cm) ➔ Kritis di bawah batas AWD" },
      { wl: "14.8",  temp: "27.1", hum: "88.0", desc: "Banjir Tinggi (+14.8 cm) ➔ Melampaui batas atas sawah" },
      { wl: "3.2",   temp: "29.0", hum: "78.0", desc: "Optimal (+3.2 cm) ➔ Kondisi air ideal fase pertumbuhan" },
      { wl: "-4.5",  temp: "30.5", hum: "70.0", desc: "Mulai Kering (-4.5 cm) ➔ Mendekati ambang batas bawah" },
      { wl: "8.5",   temp: "28.3", hum: "82.0", desc: "Cukup Tinggi (+8.5 cm) ➔ Batas atas normal" },
    ];

    for (let i = 0; i < fieldSubBlocks.length; i++) {
      const sb = fieldSubBlocks[i];
      // Ambil skenario bervariasi sesuai indeks petak & diacak secara bertahap
      const scenarioIndex = (i + Math.floor(Date.now() / 60000)) % dynamicScenarios.length;
      const scenario = dynamicScenarios[scenarioIndex];

      // Pastikan ada device sensor untuk sub-block ini
      let [device] = await db.select().from(devices).where(eq(devices.subBlockId, sb.id)).limit(1);
      if (!device) {
        const devId = randomUUID();
        const devCode = `DEV-TEST-${sb.code || sb.id.substring(0, 6)}`;
        await db.insert(devices).values({
          id: devId,
          deviceCode: devCode,
          deviceType: 'awd_water_level',
          connectionType: 'lorawan',
          fieldId: targetField.id,
          subBlockId: sb.id,
          status: 'active',
        }).onConflictDoNothing();
        
        [device] = await db.select().from(devices).where(eq(devices.id, devId)).limit(1);
      }

      console.log(`\n🔹 Petak [${sb.code || sb.id.substring(0, 8)}] ➔ Mengirim ke sensor: ${device.deviceCode}`);
      console.log(`   Kondisi : ${scenario.desc}`);
      console.log(`   Bacaan  : Muka Air ${scenario.wl} cm | Suhu ${scenario.temp}°C | Kelembaban ${scenario.hum}%`);

      // Sisipkan telemetry mentah murni (telemetry_records)
      await db.insert(telemetryRecords).values({
        id: randomUUID(),
        eventTimestamp: new Date(),
        deviceId: device.id,
        deviceCode: device.deviceCode,
        subBlockId: sb.id,
        waterLevelCm: scenario.wl,
        waterLevelRawCm: scenario.wl,
        temperatureC: scenario.temp,
        humidityPct: scenario.hum,
        batteryPct: "96.5",
        isValid: true,
      });
    }

    console.log('\n====================================================================');
    console.log('🔄 TAHAP 3: AGREGASI STATUS & KALKULASI ALGORITMA DSS AI ENGINE');
    console.log('====================================================================');

    // Panggil buildFieldStates agar sistem membaca data raw sensor terbaru
    console.log('⚙️ Memanggil buildFieldStates() untuk memperbarui status air petak...');
    const updatedStatesCount = await buildFieldStates(targetField.id);
    console.log(`✅ Terupdate: ${updatedStatesCount} petak sawah menggunakan data sensor terbaru.`);

    // Picu AI Engine murni tanpa manipulasi output
    console.log('\n🧠 Memicu evaluasi algoritma mandiri DSS Engine AI (/evaluate)...');
    try {
      await runDecisionCycleForField(targetField.id, 'normal');
      console.log('✅ Kalkulasi Engine AI sukses!');
      
      console.log('⏳ Menunggu 2 detik untuk kalkulasi rute air Floyd-Warshall antar petak...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err: any) {
      console.error(`⚠️ AI Engine merespons kendala/offline: ${err?.message || err}`);
    }

    // Periksa hasil evaluasi AI yang asli di tabel output
    const [latestJob] = await db.select().from(decisionJobs)
      .where(eq(decisionJobs.fieldId, targetField.id))
      .orderBy(desc(decisionJobs.completedAt))
      .limit(1);

    if (latestJob) {
      const generatedRecs = await db.select().from(irrigationRecommendations)
        .where(eq(irrigationRecommendations.decisionJobId, latestJob.id))
        .orderBy(irrigationRecommendations.priorityRank);

      console.log(`\n====================================================================`);
      console.log(`🎯 HASIL REKOMENDASI DSS (TERASIMILASI DENGAN RUTE ANTAR KOTAK)`);
      console.log(`   Decision Job ID : ${latestJob.id}`);
      console.log(`   Total Output    : ${generatedRecs.length} rekomendasi`);
      console.log(`====================================================================\n`);

      generatedRecs.forEach((rec, idx) => {
        const routeLabel = rec.fromSubBlockId || rec.toSubBlockId ? ' | 🔄 RUTE ANTAR-KOTAK AKTIF' : '';
        console.log(`[#${idx + 1}] Tipe: ${rec.recommendationType.toUpperCase()} | Prioritas Rank: ${rec.priorityRank} | Score: ${rec.priorityScore}${routeLabel}`);
        console.log(`     📢 Komando AI : "${rec.commandText}"`);
        console.log(`     💡 Alasan AI  : "${rec.reasonSummary}"`);
        if (rec.routingScore) console.log(`     🧭 Bobot Rute : ${rec.routingScore}`);
        console.log(`     🌊 Level Air  : ${rec.waterLevelCmAtDecision} cm\n`);
      });
      console.log(`====================================================================`);
    } else {
      console.log('\n⚠️ Belum ada decision job yang tercatat.');
    }

    console.log('\n✅ Pengujian bertahap selesai! Silakan periksa hasilnya langsung di UI Frontend.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal menjalankan pengujian sensor:', err);
    process.exit(1);
  }
}

seedSensorTest();
