"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embankmentsService = exports.ruleProfilesService = exports.cropCyclesService = exports.irrigationPointsService = exports.flowPathsService = exports.devicesService = exports.subBlocksService = exports.fieldsService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../db/client");
const mst_1 = require("../../db/schema/mst");
const schema_1 = require("../../db/schema");
const trx_1 = require("../../db/schema/trx");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_util_1 = require("../../shared/utils/pagination.util");
const config_1 = require("../../config");
// ===========================================================================
// FIELDS
// ===========================================================================
exports.fieldsService = {
    async list(userId, isAdmin, query) {
        const { page, limit, offset } = (0, pagination_util_1.parsePagination)(query);
        // Admin melihat semua field; user lain hanya yang punya akses
        let rows;
        let total = 0;
        if (isAdmin) {
            [rows, [{ value: total }]] = await Promise.all([
                client_1.db.select().from(mst_1.fields).where((0, drizzle_orm_1.eq)(mst_1.fields.isActive, true))
                    .orderBy(mst_1.fields.name).limit(limit).offset(offset),
                client_1.db.select({ value: (0, drizzle_orm_1.count)() }).from(mst_1.fields).where((0, drizzle_orm_1.eq)(mst_1.fields.isActive, true)),
            ]);
        }
        else {
            const userFieldsSubQuery = client_1.db
                .select({ fieldId: mst_1.userFields.fieldId })
                .from(mst_1.userFields)
                .where((0, drizzle_orm_1.eq)(mst_1.userFields.userId, userId));
            [rows, [{ value: total }]] = await Promise.all([
                client_1.db.select().from(mst_1.fields)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.fields.isActive, true), (0, drizzle_orm_1.sql) `${mst_1.fields.id} IN (${userFieldsSubQuery})`))
                    .orderBy(mst_1.fields.name).limit(limit).offset(offset),
                client_1.db.select({ value: (0, drizzle_orm_1.count)() }).from(mst_1.fields)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.fields.isActive, true), (0, drizzle_orm_1.sql) `${mst_1.fields.id} IN (${userFieldsSubQuery})`)),
            ]);
        }
        return { rows, meta: (0, pagination_util_1.buildPaginationMeta)({ page, limit, offset }, total) };
    },
    async getById(fieldId) {
        const [field] = await client_1.db
            .select()
            .from(mst_1.fields)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.fields.id, fieldId), (0, drizzle_orm_1.eq)(mst_1.fields.isActive, true)))
            .limit(1);
        if (!field)
            throw new error_middleware_1.AppError(404, 'FIELD_NOT_FOUND', 'Field tidak ditemukan');
        return field;
    },
    async create(input, createdByUserId) {
        const GISPROC_API_BASE_URI = config_1.config.GISPROC_API_BASE_URI;
        const [field] = await client_1.db
            .insert(mst_1.fields)
            .values({
            name: input.name,
            description: input.description,
            adm4Code: input.adm4_code,
            waterSourceType: input.water_source_type,
            areaHectares: input.area_hectares?.toString(),
            operatorCountDefault: input.operator_count_default,
            decisionCycleMode: input.decision_cycle_mode,
            notes: input.notes,
            mapVisualUrl: `${GISPROC_API_BASE_URI}/webodm/display?project_name=${createdByUserId}&task_name=${input.name}&asset_type=orthophoto.tif`,
            assignedFileName: input.assigned_file_name,
            irrigationEdges: input.irrigation_edges,
            irrigationNodes: input.irrigation_nodes,
        })
            .returning();
        // Auto-grant manager access to creator (jika bukan system_admin)
        await client_1.db.insert(mst_1.userFields).values({
            userId: createdByUserId,
            fieldId: field.id,
            fieldRole: 'manager',
            grantedBy: createdByUserId,
        }).onConflictDoNothing();
        return field;
    },
    async update(fieldId, input) {
        const [updated] = await client_1.db
            .update(mst_1.fields)
            .set({
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.adm4_code !== undefined && { adm4Code: input.adm4_code }),
            ...(input.water_source_type !== undefined && { waterSourceType: input.water_source_type }),
            ...(input.area_hectares !== undefined && { areaHectares: input.area_hectares.toString() }),
            ...(input.operator_count_default !== undefined && { operatorCountDefault: input.operator_count_default }),
            ...(input.decision_cycle_mode !== undefined && { decisionCycleMode: input.decision_cycle_mode }),
            ...(input.is_source_depleted !== undefined && { isSourceDepleted: input.is_source_depleted }),
            ...(input.notes !== undefined && { notes: input.notes }),
            ...(input.assigned_file_name !== undefined && { assignedFileName: input.assigned_file_name }),
            ...(input.irrigation_edges !== undefined && { irrigationEdges: input.irrigation_edges }),
            ...(input.irrigation_nodes !== undefined && { irrigationNodes: input.irrigation_nodes }),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(mst_1.fields.id, fieldId))
            .returning();
        if (!updated)
            throw new error_middleware_1.AppError(404, 'FIELD_NOT_FOUND', 'Field tidak ditemukan');
        return updated;
    },
    async updateDroughtStatus(fieldId, isSourceDepleted) {
        const [updated] = await client_1.db
            .update(mst_1.fields)
            .set({
            isSourceDepleted,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(mst_1.fields.id, fieldId))
            .returning();
        if (!updated)
            throw new error_middleware_1.AppError(404, 'FIELD_NOT_FOUND', 'Field tidak ditemukan');
        return updated;
    },
    async assignUser(fieldId, input, grantedBy) {
        // Cek user exists
        const [user] = await client_1.db.select({ id: mst_1.users.id })
            .from(mst_1.users).where((0, drizzle_orm_1.eq)(mst_1.users.id, input.user_id)).limit(1);
        if (!user)
            throw new error_middleware_1.AppError(404, 'USER_NOT_FOUND', 'User tidak ditemukan');
        await client_1.db.insert(mst_1.userFields)
            .values({
            userId: input.user_id,
            fieldId,
            fieldRole: input.field_role,
            grantedBy,
        })
            .onConflictDoUpdate({
            target: [mst_1.userFields.userId, mst_1.userFields.fieldId],
            set: { fieldRole: input.field_role, grantedBy, grantedAt: new Date() },
        });
    },
    async revokeUser(fieldId, userId) {
        await client_1.db.delete(mst_1.userFields)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.userFields.fieldId, fieldId), (0, drizzle_orm_1.eq)(mst_1.userFields.userId, userId)));
    },
    async delete(fieldId) {
        await client_1.db.update(mst_1.fields)
            .set({ isActive: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(mst_1.fields.id, fieldId));
    },
};
// ===========================================================================
// SUB-BLOCKS
// ===========================================================================
/** Calculate connected sub-blocks based on polygon overlap using ST_Intersects */
async function calculateIntersectingSubBlocks(fieldId, polygonGeom) {
    if (!polygonGeom)
        return [];
    const geomJson = typeof polygonGeom === 'string' ? polygonGeom : JSON.stringify(polygonGeom);
    const result = await client_1.db.select({ id: mst_1.subBlocks.id })
        .from(mst_1.subBlocks)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.subBlocks.fieldId, fieldId), (0, drizzle_orm_1.eq)(mst_1.subBlocks.isActive, true), (0, drizzle_orm_1.sql) `ST_Intersects(${mst_1.subBlocks.polygonGeom}, ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326))`));
    return result.map(row => row.id);
}
/** Recalculate connected sub-blocks for all active embankments in a field */
async function recalculateFieldEmbankments(fieldId) {
    const embs = await client_1.db.select({ id: mst_1.embankments.id, polygonGeom: mst_1.embankments.polygonGeom })
        .from(mst_1.embankments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.embankments.fieldId, fieldId), (0, drizzle_orm_1.eq)(mst_1.embankments.isActive, true)));
    for (const emb of embs) {
        const connectedSubBlocks = await calculateIntersectingSubBlocks(fieldId, emb.polygonGeom);
        await client_1.db.update(mst_1.embankments)
            .set({ connectedSubBlocks, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(mst_1.embankments.id, emb.id));
    }
}
/** Coerce numeric string columns returned by PostgreSQL into JS numbers. */
function parseSubBlockNumerics(sb) {
    return {
        ...sb,
        areaM2: sb.areaM2 != null ? parseFloat(sb.areaM2) : null,
        elevationM: sb.elevationM != null ? parseFloat(sb.elevationM) : null,
    };
}
exports.subBlocksService = {
    async listByField(fieldId) {
        const rows = await client_1.db.select({
            id: mst_1.subBlocks.id,
            fieldId: mst_1.subBlocks.fieldId,
            name: mst_1.subBlocks.name,
            code: mst_1.subBlocks.code,
            uniqueCode: mst_1.subBlocks.uniqueCode,
            polygonGeom: (0, drizzle_orm_1.sql) `ST_AsGeoJSON(${mst_1.subBlocks.polygonGeom})`,
            areaM2: mst_1.subBlocks.areaM2,
            centroid: (0, drizzle_orm_1.sql) `ST_AsGeoJSON(${mst_1.subBlocks.centroid})`,
            elevationM: mst_1.subBlocks.elevationM,
            soilType: mst_1.subBlocks.soilType,
            displayOrder: mst_1.subBlocks.displayOrder,
            isActive: mst_1.subBlocks.isActive,
            notes: mst_1.subBlocks.notes,
            createdAt: mst_1.subBlocks.createdAt,
            updatedAt: mst_1.subBlocks.updatedAt,
        })
            .from(mst_1.subBlocks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.subBlocks.fieldId, fieldId), (0, drizzle_orm_1.eq)(mst_1.subBlocks.isActive, true)))
            .orderBy(mst_1.subBlocks.displayOrder, mst_1.subBlocks.name);
        const assignments = await client_1.db.select({
            subBlockId: mst_1.deviceAssignments.subBlockId,
            deviceId: mst_1.devices.id,
            deviceCode: mst_1.devices.deviceCode,
            deviceType: mst_1.devices.deviceType,
            notes: mst_1.devices.notes,
        })
            .from(mst_1.deviceAssignments)
            .innerJoin(mst_1.devices, (0, drizzle_orm_1.eq)(mst_1.deviceAssignments.deviceId, mst_1.devices.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.deviceAssignments.fieldId, fieldId), (0, drizzle_orm_1.sql) `${mst_1.deviceAssignments.unassignedAt} IS NULL`));
        const parsedRows = rows.map(parseSubBlockNumerics);
        return parsedRows.map(row => ({
            ...row,
            devices: assignments
                .filter(a => a.subBlockId === row.id)
                .map(a => ({ id: a.deviceId, deviceCode: a.deviceCode, deviceType: a.deviceType, notes: a.notes })),
        }));
    },
    async getById(subBlockId) {
        const [sb] = await client_1.db.select({
            id: mst_1.subBlocks.id,
            fieldId: mst_1.subBlocks.fieldId,
            name: mst_1.subBlocks.name,
            code: mst_1.subBlocks.code,
            uniqueCode: mst_1.subBlocks.uniqueCode,
            polygonGeom: (0, drizzle_orm_1.sql) `ST_AsGeoJSON(${mst_1.subBlocks.polygonGeom})`,
            areaM2: mst_1.subBlocks.areaM2,
            centroid: (0, drizzle_orm_1.sql) `ST_AsGeoJSON(${mst_1.subBlocks.centroid})`,
            elevationM: mst_1.subBlocks.elevationM,
            soilType: mst_1.subBlocks.soilType,
            displayOrder: mst_1.subBlocks.displayOrder,
            isActive: mst_1.subBlocks.isActive,
            notes: mst_1.subBlocks.notes,
            createdAt: mst_1.subBlocks.createdAt,
            updatedAt: mst_1.subBlocks.updatedAt,
        }).from(mst_1.subBlocks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.subBlocks.id, subBlockId), (0, drizzle_orm_1.eq)(mst_1.subBlocks.isActive, true)))
            .limit(1);
        if (!sb)
            throw new error_middleware_1.AppError(404, 'SUB_BLOCK_NOT_FOUND', 'Sub-block tidak ditemukan');
        const assignments = await client_1.db.select({
            deviceId: mst_1.devices.id,
            deviceCode: mst_1.devices.deviceCode,
            deviceType: mst_1.devices.deviceType,
            notes: mst_1.devices.notes,
        })
            .from(mst_1.deviceAssignments)
            .innerJoin(mst_1.devices, (0, drizzle_orm_1.eq)(mst_1.deviceAssignments.deviceId, mst_1.devices.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.deviceAssignments.subBlockId, subBlockId), (0, drizzle_orm_1.sql) `${mst_1.deviceAssignments.unassignedAt} IS NULL`));
        return {
            ...parseSubBlockNumerics(sb),
            devices: assignments.map(a => ({ id: a.deviceId, deviceCode: a.deviceCode, deviceType: a.deviceType, notes: a.notes })),
        };
    },
    async create(fieldId, input) {
        const geomJson = JSON.stringify(input.polygon_geom);
        const [inserted] = await client_1.db.insert(mst_1.subBlocks).values({
            fieldId,
            name: input.name,
            code: input.code,
            polygonGeom: geomJson,
            elevationM: input.elevation_m?.toString(),
            soilType: input.soil_type,
            displayOrder: input.display_order,
            notes: input.notes,
        }).returning();
        if (!inserted)
            throw new error_middleware_1.AppError(500, 'CREATE_FAILED', 'Gagal membuat sub-block');
        // Recalculate connected sub-blocks for embankments in this field
        await recalculateFieldEmbankments(fieldId);
        return inserted;
    },
    async update(subBlockId, input) {
        const setParts = { updatedAt: new Date() };
        if (input.name !== undefined)
            setParts['name'] = input.name;
        if (input.code !== undefined)
            setParts['code'] = input.code;
        if (input.elevation_m !== undefined)
            setParts['elevationM'] = input.elevation_m;
        if (input.soil_type !== undefined)
            setParts['soilType'] = input.soil_type;
        if (input.display_order !== undefined)
            setParts['displayOrder'] = input.display_order;
        if (input.notes !== undefined)
            setParts['notes'] = input.notes;
        if (input.polygon_geom !== undefined)
            setParts['polygonGeom'] = JSON.stringify(input.polygon_geom);
        const [updated] = await client_1.db.update(mst_1.subBlocks)
            .set(setParts)
            .where((0, drizzle_orm_1.eq)(mst_1.subBlocks.id, subBlockId))
            .returning();
        if (!updated)
            throw new error_middleware_1.AppError(404, 'SUB_BLOCK_NOT_FOUND', 'Sub-block tidak ditemukan');
        // Recalculate field embankments if polygon geom changed
        if (input.polygon_geom !== undefined) {
            await recalculateFieldEmbankments(updated.fieldId);
        }
        return updated;
    },
    /** Bulk import dari GeoJSON FeatureCollection */
    async importFromGeoJson(fieldId, input) {
        const insertedIds = [];
        for (const feature of input.geojson.features) {
            const props = feature.properties ?? {};
            const name = String(props[input.name_field] ?? `Sub-block ${insertedIds.length + 1}`);
            const code = input.code_field ? String(props[input.code_field] ?? '') : undefined;
            const geomJson = JSON.stringify(feature.geometry);
            const [inserted] = await client_1.db.insert(mst_1.subBlocks).values({
                fieldId,
                name,
                code,
                polygonGeom: geomJson,
            }).returning();
            if (inserted)
                insertedIds.push(inserted.id);
        }
        if (insertedIds.length > 0) {
            await recalculateFieldEmbankments(fieldId);
        }
        return { inserted: insertedIds.length, ids: insertedIds };
    },
    async delete(subBlockId) {
        const [updated] = await client_1.db.update(mst_1.subBlocks)
            .set({ isActive: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(mst_1.subBlocks.id, subBlockId))
            .returning();
        if (updated) {
            await recalculateFieldEmbankments(updated.fieldId);
        }
    },
    async resolveEmbankmentBreak(subBlockId, resolvedBy) {
        // Cari semua event snooze_dss bertipe pematang jebol untuk subBlock ini
        // yang expiresAt nya masih > now
        await client_1.db.update(schema_1.managementEvents)
            .set({
            flagExpiresAt: new Date(),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.managementEvents.subBlockId, subBlockId), (0, drizzle_orm_1.eq)(schema_1.managementEvents.eventType, 'snooze_dss'), (0, drizzle_orm_1.eq)(schema_1.managementEvents.attentionFlagText, 'Pematang Jebol/Bocor'), (0, drizzle_orm_1.sql) `${schema_1.managementEvents.flagExpiresAt} > NOW()`));
    },
};
// ===========================================================================
// DEVICES
// ===========================================================================
exports.devicesService = {
    async listAll(query) {
        const { page, limit, offset } = (0, pagination_util_1.parsePagination)(query);
        const [rows, [{ value: total }]] = await Promise.all([
            client_1.db.select({
                id: mst_1.devices.id,
                deviceCode: mst_1.devices.deviceCode,
                deviceType: mst_1.devices.deviceType,
                connectionType: mst_1.devices.connectionType,
                hardwareModel: mst_1.devices.hardwareModel,
                serialNumber: mst_1.devices.serialNumber,
                firmwareVersion: mst_1.devices.firmwareVersion,
                fieldId: mst_1.devices.fieldId,
                subBlockId: mst_1.devices.subBlockId,
                subBlockName: mst_1.subBlocks.name,
                status: mst_1.devices.status,
                batteryLevelPct: mst_1.devices.batteryLevelPct,
                batteryUpdatedAt: mst_1.devices.batteryUpdatedAt,
                installedAt: mst_1.devices.installedAt,
                lastSeenAt: mst_1.devices.lastSeenAt,
                notes: mst_1.devices.notes,
                topic: mst_1.devices.topic,
                coordinate: mst_1.devices.coordinate,
                createdAt: mst_1.devices.createdAt,
                updatedAt: mst_1.devices.updatedAt,
            })
                .from(mst_1.devices)
                .leftJoin(mst_1.subBlocks, (0, drizzle_orm_1.eq)(mst_1.devices.subBlockId, mst_1.subBlocks.id))
                .orderBy(mst_1.devices.deviceCode)
                .limit(limit).offset(offset),
            client_1.db.select({ value: (0, drizzle_orm_1.count)() }).from(mst_1.devices),
        ]);
        return { rows, meta: (0, pagination_util_1.buildPaginationMeta)({ page, limit, offset }, total) };
    },
    async listByField(fieldId) {
        return client_1.db.select({
            id: mst_1.devices.id,
            deviceCode: mst_1.devices.deviceCode,
            deviceType: mst_1.devices.deviceType,
            connectionType: mst_1.devices.connectionType,
            hardwareModel: mst_1.devices.hardwareModel,
            serialNumber: mst_1.devices.serialNumber,
            firmwareVersion: mst_1.devices.firmwareVersion,
            fieldId: mst_1.devices.fieldId,
            subBlockId: mst_1.devices.subBlockId,
            subBlockName: mst_1.subBlocks.name,
            status: mst_1.devices.status,
            batteryLevelPct: mst_1.devices.batteryLevelPct,
            batteryUpdatedAt: mst_1.devices.batteryUpdatedAt,
            installedAt: mst_1.devices.installedAt,
            lastSeenAt: mst_1.devices.lastSeenAt,
            notes: mst_1.devices.notes,
            topic: mst_1.devices.topic,
            coordinate: mst_1.devices.coordinate,
            createdAt: mst_1.devices.createdAt,
            updatedAt: mst_1.devices.updatedAt,
        })
            .from(mst_1.devices)
            .leftJoin(mst_1.subBlocks, (0, drizzle_orm_1.eq)(mst_1.devices.subBlockId, mst_1.subBlocks.id))
            .where((0, drizzle_orm_1.eq)(mst_1.devices.fieldId, fieldId))
            .orderBy(mst_1.devices.deviceCode);
    },
    async getById(deviceId) {
        const [dev] = await client_1.db.select({
            id: mst_1.devices.id,
            deviceCode: mst_1.devices.deviceCode,
            deviceType: mst_1.devices.deviceType,
            connectionType: mst_1.devices.connectionType,
            hardwareModel: mst_1.devices.hardwareModel,
            serialNumber: mst_1.devices.serialNumber,
            firmwareVersion: mst_1.devices.firmwareVersion,
            fieldId: mst_1.devices.fieldId,
            subBlockId: mst_1.devices.subBlockId,
            subBlockName: mst_1.subBlocks.name,
            status: mst_1.devices.status,
            batteryLevelPct: mst_1.devices.batteryLevelPct,
            batteryUpdatedAt: mst_1.devices.batteryUpdatedAt,
            installedAt: mst_1.devices.installedAt,
            lastSeenAt: mst_1.devices.lastSeenAt,
            notes: mst_1.devices.notes,
            topic: mst_1.devices.topic,
            coordinate: mst_1.devices.coordinate,
            createdAt: mst_1.devices.createdAt,
            updatedAt: mst_1.devices.updatedAt,
        }).from(mst_1.devices)
            .leftJoin(mst_1.subBlocks, (0, drizzle_orm_1.eq)(mst_1.devices.subBlockId, mst_1.subBlocks.id))
            .where((0, drizzle_orm_1.eq)(mst_1.devices.id, deviceId)).limit(1);
        if (!dev)
            throw new error_middleware_1.AppError(404, 'DEVICE_NOT_FOUND', 'Device tidak ditemukan');
        return dev;
    },
    async create(fieldId, input) {
        const [dev] = await client_1.db.insert(mst_1.devices).values({
            deviceCode: input.device_code,
            deviceType: input.device_type,
            connectionType: input.connection_type,
            hardwareModel: input.hardware_model,
            serialNumber: input.serial_number,
            firmwareVersion: input.firmware_version,
            fieldId,
            status: 'active',
            notes: input.notes,
            coordinate: input.coordinate,
        }).returning();
        return dev;
    },
    async update(deviceId, input) {
        const [updated] = await client_1.db.update(mst_1.devices)
            .set({
            ...(input.device_type !== undefined && { deviceType: input.device_type }),
            ...(input.connection_type !== undefined && { connectionType: input.connection_type }),
            ...(input.hardware_model !== undefined && { hardwareModel: input.hardware_model }),
            ...(input.firmware_version !== undefined && { firmwareVersion: input.firmware_version }),
            ...(input.notes !== undefined && { notes: input.notes }),
            ...(input.coordinate !== undefined && { coordinate: input.coordinate }),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(mst_1.devices.id, deviceId))
            .returning();
        if (!updated)
            throw new error_middleware_1.AppError(404, 'DEVICE_NOT_FOUND', 'Device tidak ditemukan');
        return updated;
    },
    async assign(deviceId, fieldId, input, assignedBy) {
        // Pastikan sub-block ada dan di field yang sama
        const [sb] = await client_1.db.select({ id: mst_1.subBlocks.id, fieldId: mst_1.subBlocks.fieldId })
            .from(mst_1.subBlocks).where((0, drizzle_orm_1.eq)(mst_1.subBlocks.id, input.sub_block_id)).limit(1);
        if (!sb)
            throw new error_middleware_1.AppError(404, 'SUB_BLOCK_NOT_FOUND', 'Sub-block tidak ditemukan');
        if (sb.fieldId !== fieldId)
            throw new error_middleware_1.AppError(400, 'FIELD_MISMATCH', 'Sub-block bukan milik field ini');
        // Close existing assignment jika ada
        await client_1.db.update(mst_1.deviceAssignments)
            .set({ unassignedAt: new Date(), unassignedBy: assignedBy })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.deviceAssignments.deviceId, deviceId), (0, drizzle_orm_1.sql) `${mst_1.deviceAssignments.unassignedAt} IS NULL`));
        // Create new assignment
        await client_1.db.insert(mst_1.deviceAssignments).values({
            deviceId, subBlockId: input.sub_block_id, fieldId, assignedBy, notes: input.notes,
        });
        // Update device.sub_block_id untuk quick lookup
        await client_1.db.update(mst_1.devices)
            .set({ subBlockId: input.sub_block_id, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(mst_1.devices.id, deviceId));
    },
    async unassign(deviceId, unassignedBy) {
        await client_1.db.update(mst_1.deviceAssignments)
            .set({ unassignedAt: new Date(), unassignedBy })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.deviceAssignments.deviceId, deviceId), (0, drizzle_orm_1.sql) `${mst_1.deviceAssignments.unassignedAt} IS NULL`));
        await client_1.db.update(mst_1.devices)
            .set({ subBlockId: null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(mst_1.devices.id, deviceId));
    },
    async calibrate(deviceId, input, calibratedBy) {
        // Expire previous active calibration jika ada
        await client_1.db.update(mst_1.sensorCalibrations)
            .set({ validUntil: new Date(), isActive: false })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.sensorCalibrations.deviceId, deviceId), (0, drizzle_orm_1.eq)(mst_1.sensorCalibrations.isActive, true), (0, drizzle_orm_1.sql) `${mst_1.sensorCalibrations.validUntil} IS NULL`));
        const [cal] = await client_1.db.insert(mst_1.sensorCalibrations).values({
            deviceId,
            waterLevelOffsetCm: input.water_level_offset_cm?.toString() ?? '0.00',
            temperatureOffsetC: input.temperature_offset_c?.toString() ?? '0.00',
            humidityOffsetPct: input.humidity_offset_pct?.toString() ?? '0.00',
            validFrom: input.valid_from ? new Date(input.valid_from) : new Date(),
            validUntil: input.valid_until ? new Date(input.valid_until) : undefined,
            calibrationMethod: input.calibration_method,
            referenceReadingCm: input.reference_reading_cm?.toString(),
            calibratedBy,
            notes: input.notes,
            isActive: true,
        }).returning();
        return cal;
    },
    async delete(deviceId) {
        // Hapus records di tabel-tabel dependent terlebih dahulu agar tidak melanggar FK constraints
        await client_1.db.delete(trx_1.telemetryRecords).where((0, drizzle_orm_1.eq)(trx_1.telemetryRecords.deviceId, deviceId));
        await client_1.db.delete(mst_1.sensorCalibrations).where((0, drizzle_orm_1.eq)(mst_1.sensorCalibrations.deviceId, deviceId));
        await client_1.db.delete(mst_1.deviceAssignments).where((0, drizzle_orm_1.eq)(mst_1.deviceAssignments.deviceId, deviceId));
        await client_1.db.delete(mst_1.devices).where((0, drizzle_orm_1.eq)(mst_1.devices.id, deviceId));
    },
};
// ===========================================================================
// FLOW PATHS
// ===========================================================================
exports.flowPathsService = {
    async listByField(fieldId) {
        return client_1.db.select().from(mst_1.flowPaths)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.flowPaths.fieldId, fieldId), (0, drizzle_orm_1.eq)(mst_1.flowPaths.isActive, true)));
    },
    async getById(id) {
        const [fp] = await client_1.db.select().from(mst_1.flowPaths)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.flowPaths.id, id), (0, drizzle_orm_1.eq)(mst_1.flowPaths.isActive, true)))
            .limit(1);
        if (!fp)
            throw new error_middleware_1.AppError(404, 'FLOW_PATH_NOT_FOUND', 'Flow path tidak ditemukan');
        return fp;
    },
    async create(fieldId, input) {
        // Validasi field_id exists
        const [field] = await client_1.db.select({ id: mst_1.fields.id })
            .from(mst_1.fields).where((0, drizzle_orm_1.eq)(mst_1.fields.id, fieldId)).limit(1);
        if (!field)
            throw new error_middleware_1.AppError(404, 'FIELD_NOT_FOUND', 'Lahan tidak ditemukan');
        const [fp] = await client_1.db.insert(mst_1.flowPaths).values({
            fieldId,
            flowType: input.flow_type,
            floydWarshallMatrix: input.floyd_warshall_matrix,
            notes: input.notes,
        }).returning();
        return fp;
    },
    async update(id, input) {
        const [updated] = await client_1.db.update(mst_1.flowPaths)
            .set({
            ...(input.flow_type !== undefined && { flowType: input.flow_type }),
            ...(input.floyd_warshall_matrix !== undefined && { floydWarshallMatrix: input.floyd_warshall_matrix }),
            ...(input.notes !== undefined && { notes: input.notes }),
        })
            .where((0, drizzle_orm_1.eq)(mst_1.flowPaths.id, id))
            .returning();
        if (!updated)
            throw new error_middleware_1.AppError(404, 'FLOW_PATH_NOT_FOUND', 'Flow path tidak ditemukan');
        return updated;
    },
    async delete(flowPathId) {
        await client_1.db.update(mst_1.flowPaths)
            .set({ isActive: false })
            .where((0, drizzle_orm_1.eq)(mst_1.flowPaths.id, flowPathId));
    },
};
function parseIrrigationPoint(ip) {
    let coordinatePoint = null;
    if (ip.coordinatePoint) {
        try {
            coordinatePoint = JSON.parse(ip.coordinatePoint);
        }
        catch {
            coordinatePoint = ip.coordinatePoint;
        }
    }
    return {
        ...ip,
        coordinatePoint,
        elevationM: ip.elevationM != null ? parseFloat(ip.elevationM) : null,
    };
}
async function calculateAssignedSubBlocksForPoint(fieldId, coordinatePoint) {
    if (!coordinatePoint)
        return [];
    const geomJson = typeof coordinatePoint === 'string' ? coordinatePoint : JSON.stringify(coordinatePoint);
    const subBlockIds = new Set();
    // 1. Check if the point intersects any embankments in the field
    const intersectingEmbankments = await client_1.db.select({
        connectedSubBlocks: mst_1.embankments.connectedSubBlocks,
    })
        .from(mst_1.embankments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.embankments.fieldId, fieldId), (0, drizzle_orm_1.eq)(mst_1.embankments.isActive, true), (0, drizzle_orm_1.sql) `ST_Intersects(ST_SetSRID(ST_GeomFromGeoJSON(${mst_1.embankments.polygonGeom}), 4326), ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326))`));
    for (const emb of intersectingEmbankments) {
        const connected = emb.connectedSubBlocks ?? [];
        connected.forEach(id => subBlockIds.add(id));
    }
    // 2. Check if the point intersects any sub-blocks directly
    const intersectingSubBlocks = await client_1.db.select({
        id: mst_1.subBlocks.id,
    })
        .from(mst_1.subBlocks)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.subBlocks.fieldId, fieldId), (0, drizzle_orm_1.eq)(mst_1.subBlocks.isActive, true), (0, drizzle_orm_1.sql) `ST_Intersects(${mst_1.subBlocks.polygonGeom}, ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326))`));
    intersectingSubBlocks.forEach(row => subBlockIds.add(row.id));
    return Array.from(subBlockIds);
}
exports.irrigationPointsService = {
    async listByField(fieldId) {
        const rows = await client_1.db.select().from(mst_1.irrigationPoints)
            .where((0, drizzle_orm_1.eq)(mst_1.irrigationPoints.fieldId, fieldId));
        return rows.map(parseIrrigationPoint);
    },
    async getById(id) {
        const [ip] = await client_1.db.select().from(mst_1.irrigationPoints)
            .where((0, drizzle_orm_1.eq)(mst_1.irrigationPoints.id, id))
            .limit(1);
        if (!ip)
            throw new error_middleware_1.AppError(404, 'IRRIGATION_POINT_NOT_FOUND', 'Titik irigasi tidak ditemukan');
        return parseIrrigationPoint(ip);
    },
    async create(fieldId, input) {
        // Validasi field_id exists
        const [field] = await client_1.db.select({ id: mst_1.fields.id })
            .from(mst_1.fields).where((0, drizzle_orm_1.eq)(mst_1.fields.id, fieldId)).limit(1);
        if (!field)
            throw new error_middleware_1.AppError(404, 'FIELD_NOT_FOUND', 'Lahan tidak ditemukan');
        // Calculate assigned sub-blocks automatically based on point containment
        let assignedSubBlocks = [];
        if (input.coordinate_point) {
            assignedSubBlocks = await calculateAssignedSubBlocksForPoint(fieldId, input.coordinate_point);
        }
        const [ip] = await client_1.db.insert(mst_1.irrigationPoints).values({
            fieldId,
            pointType: input.point_type,
            coordinatePoint: input.coordinate_point ? JSON.stringify(input.coordinate_point) : null,
            elevationM: input.elevation_m?.toString(),
            name: input.name,
            assignedSubBlocks: assignedSubBlocks,
        }).returning();
        return parseIrrigationPoint(ip);
    },
    async update(id, input) {
        const [existing] = await client_1.db.select({ fieldId: mst_1.irrigationPoints.fieldId, coordinatePoint: mst_1.irrigationPoints.coordinatePoint })
            .from(mst_1.irrigationPoints).where((0, drizzle_orm_1.eq)(mst_1.irrigationPoints.id, id)).limit(1);
        if (!existing)
            throw new error_middleware_1.AppError(404, 'IRRIGATION_POINT_NOT_FOUND', 'Titik irigasi tidak ditemukan');
        let assignedSubBlocks = undefined;
        if (input.coordinate_point !== undefined) {
            if (input.coordinate_point) {
                assignedSubBlocks = await calculateAssignedSubBlocksForPoint(existing.fieldId, input.coordinate_point);
            }
            else {
                assignedSubBlocks = [];
            }
        }
        const [updated] = await client_1.db.update(mst_1.irrigationPoints)
            .set({
            ...(input.point_type !== undefined && { pointType: input.point_type }),
            ...(input.coordinate_point !== undefined && {
                coordinatePoint: input.coordinate_point ? JSON.stringify(input.coordinate_point) : null
            }),
            ...(input.elevation_m !== undefined && { elevationM: input.elevation_m?.toString() }),
            ...(input.name !== undefined && { name: input.name }),
            ...(assignedSubBlocks !== undefined && { assignedSubBlocks }),
        })
            .where((0, drizzle_orm_1.eq)(mst_1.irrigationPoints.id, id))
            .returning();
        if (!updated)
            throw new error_middleware_1.AppError(404, 'IRRIGATION_POINT_NOT_FOUND', 'Titik irigasi tidak ditemukan');
        return parseIrrigationPoint(updated);
    },
    async delete(id) {
        const [deleted] = await client_1.db.delete(mst_1.irrigationPoints)
            .where((0, drizzle_orm_1.eq)(mst_1.irrigationPoints.id, id))
            .returning();
        if (!deleted)
            throw new error_middleware_1.AppError(404, 'IRRIGATION_POINT_NOT_FOUND', 'Titik irigasi tidak ditemukan');
    },
};
// ===========================================================================
// CROP CYCLES
// ===========================================================================
exports.cropCyclesService = {
    async listBySubBlock(subBlockId) {
        return client_1.db.select().from(mst_1.cropCycles)
            .where((0, drizzle_orm_1.eq)(mst_1.cropCycles.subBlockId, subBlockId))
            .orderBy((0, drizzle_orm_1.desc)(mst_1.cropCycles.createdAt));
    },
    async getActive(subBlockId) {
        const [cc] = await client_1.db.select().from(mst_1.cropCycles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.cropCycles.subBlockId, subBlockId), (0, drizzle_orm_1.eq)(mst_1.cropCycles.status, 'active')))
            .limit(1);
        return cc ?? null;
    },
    async create(subBlockId, fieldId, input) {
        // Tidak boleh ada crop cycle aktif pada sub-block yang sama
        const existing = await this.getActive(subBlockId);
        if (existing)
            throw new error_middleware_1.AppError(409, 'CROP_CYCLE_ACTIVE', 'Sub-block ini sudah memiliki crop cycle yang aktif');
        const [cc] = await client_1.db.insert(mst_1.cropCycles).values({
            subBlockId,
            fieldId,
            bucketCode: input.bucket_code,
            varietyName: input.variety_name,
            ruleProfileId: input.rule_profile_id,
            plantingDate: input.planting_date,
            expectedHarvestDate: input.expected_harvest_date,
            currentPhaseCode: 'land_prep',
            currentHst: 0,
            status: 'active',
            notes: input.notes,
        }).returning();
        return cc;
    },
    async advancePhase(cropCycleId, input) {
        const [cc] = await client_1.db.select().from(mst_1.cropCycles)
            .where((0, drizzle_orm_1.eq)(mst_1.cropCycles.id, cropCycleId)).limit(1);
        if (!cc)
            throw new error_middleware_1.AppError(404, 'CROP_CYCLE_NOT_FOUND', 'Crop cycle tidak ditemukan');
        if (cc.status !== 'active')
            throw new error_middleware_1.AppError(400, 'CROP_CYCLE_NOT_ACTIVE', 'Crop cycle tidak aktif');
        const [updated] = await client_1.db.update(mst_1.cropCycles)
            .set({
            currentPhaseCode: input.current_phase_code,
            ...(input.rule_profile_id !== undefined && { ruleProfileId: input.rule_profile_id }),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(mst_1.cropCycles.id, cropCycleId))
            .returning();
        return updated;
    },
    async complete(cropCycleId, actualHarvestDate) {
        const [updated] = await client_1.db.update(mst_1.cropCycles)
            .set({
            status: 'completed',
            currentPhaseCode: 'harvested',
            actualHarvestDate: actualHarvestDate,
            completedAt: new Date(),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(mst_1.cropCycles.id, cropCycleId))
            .returning();
        if (!updated)
            throw new error_middleware_1.AppError(404, 'CROP_CYCLE_NOT_FOUND', 'Crop cycle tidak ditemukan');
        return updated;
    },
    async getById(id) {
        const [cc] = await client_1.db.select().from(mst_1.cropCycles).where((0, drizzle_orm_1.eq)(mst_1.cropCycles.id, id)).limit(1);
        if (!cc)
            throw new error_middleware_1.AppError(404, 'CROP_CYCLE_NOT_FOUND', 'Crop cycle tidak ditemukan');
        return cc;
    },
    async delete(id) {
        await client_1.db.delete(mst_1.cropCycles).where((0, drizzle_orm_1.eq)(mst_1.cropCycles.id, id));
    },
};
/** Coerce numeric string columns returned by PostgreSQL into JS numbers. */
function parseRuleProfileNumerics(profile) {
    return {
        ...profile,
        awdLowerThresholdCm: parseFloat(profile.awdLowerThresholdCm),
        awdUpperTargetCm: parseFloat(profile.awdUpperTargetCm),
        droughtAlertCm: profile.droughtAlertCm != null ? parseFloat(profile.droughtAlertCm) : null,
        rainDelayMm: parseFloat(profile.rainDelayMm),
        priorityWeight: parseFloat(profile.priorityWeight),
    };
}
exports.ruleProfilesService = {
    async list(query) {
        const { page, limit, offset } = (0, pagination_util_1.parsePagination)(query);
        const [rows, [{ value: total }]] = await Promise.all([
            client_1.db.select().from(mst_1.irrigationRuleProfiles)
                .where((0, drizzle_orm_1.eq)(mst_1.irrigationRuleProfiles.isActive, true))
                .orderBy(mst_1.irrigationRuleProfiles.name).limit(limit).offset(offset),
            client_1.db.select({ value: (0, drizzle_orm_1.count)() }).from(mst_1.irrigationRuleProfiles)
                .where((0, drizzle_orm_1.eq)(mst_1.irrigationRuleProfiles.isActive, true)),
        ]);
        return { rows: rows.map(parseRuleProfileNumerics), meta: (0, pagination_util_1.buildPaginationMeta)({ page, limit, offset }, total) };
    },
    async create(input, createdBy) {
        const [profile] = await client_1.db.insert(mst_1.irrigationRuleProfiles).values({
            name: input.name,
            description: input.description,
            bucketCode: input.bucket_code,
            phaseCode: input.phase_code,
            awdLowerThresholdCm: input.awd_lower_threshold_cm.toString(),
            awdUpperTargetCm: input.awd_upper_target_cm.toString(),
            droughtAlertCm: input.drought_alert_cm?.toString(),
            minSaturationDays: input.min_saturation_days,
            rainDelayMm: input.rain_delay_mm.toString(),
            priorityWeight: input.priority_weight.toString(),
            rainfedModifierPct: input.rainfed_modifier_pct.toString(),
            targetConfidence: input.target_confidence,
            isDefault: input.is_default,
            createdBy,
        }).returning();
        return parseRuleProfileNumerics(profile);
    },
    async getById(id) {
        const [profile] = await client_1.db.select().from(mst_1.irrigationRuleProfiles).where((0, drizzle_orm_1.eq)(mst_1.irrigationRuleProfiles.id, id)).limit(1);
        if (!profile)
            throw new error_middleware_1.AppError(404, 'RULE_PROFILE_NOT_FOUND', 'Profil aturan tidak ditemukan');
        return parseRuleProfileNumerics(profile);
    },
    async update(id, input) {
        const [updated] = await client_1.db.update(mst_1.irrigationRuleProfiles)
            .set({
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.bucket_code !== undefined && { bucketCode: input.bucket_code }),
            ...(input.phase_code !== undefined && { phaseCode: input.phase_code }),
            ...(input.awd_lower_threshold_cm !== undefined && { awdLowerThresholdCm: input.awd_lower_threshold_cm.toString() }),
            ...(input.awd_upper_target_cm !== undefined && { awdUpperTargetCm: input.awd_upper_target_cm.toString() }),
            ...(input.drought_alert_cm !== undefined && { droughtAlertCm: input.drought_alert_cm?.toString() }),
            ...(input.min_saturation_days !== undefined && { minSaturationDays: input.min_saturation_days }),
            ...(input.rain_delay_mm !== undefined && { rainDelayMm: input.rain_delay_mm.toString() }),
            ...(input.priority_weight !== undefined && { priorityWeight: input.priority_weight.toString() }),
            ...(input.rainfed_modifier_pct !== undefined && { rainfedModifierPct: input.rainfed_modifier_pct.toString() }),
            ...(input.target_confidence !== undefined && { targetConfidence: input.target_confidence }),
            ...(input.is_default !== undefined && { isDefault: input.is_default }),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(mst_1.irrigationRuleProfiles.id, id))
            .returning();
        return parseRuleProfileNumerics(updated);
    },
    async delete(id) {
        await client_1.db.update(mst_1.irrigationRuleProfiles)
            .set({ isActive: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(mst_1.irrigationRuleProfiles.id, id));
    },
};
/** Coerce numeric string columns returned by PostgreSQL into JS numbers. */
function parseEmbankmentNumerics(emb) {
    let polygonGeom = emb.polygonGeom;
    if (typeof polygonGeom === 'string') {
        try {
            polygonGeom = JSON.parse(polygonGeom);
        }
        catch { /* keep as string */ }
    }
    let centroid = emb.centroid;
    if (typeof centroid === 'string') {
        try {
            centroid = JSON.parse(centroid);
        }
        catch { /* keep as string */ }
    }
    return {
        ...emb,
        polygonGeom,
        centroid,
        areaM2: emb.areaM2 != null ? parseFloat(emb.areaM2) : null,
        elevationM: emb.elevationM != null ? parseFloat(emb.elevationM) : null,
    };
}
exports.embankmentsService = {
    async listByField(fieldId) {
        const rows = await client_1.db.select()
            .from(mst_1.embankments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.embankments.fieldId, fieldId), (0, drizzle_orm_1.eq)(mst_1.embankments.isActive, true)))
            .orderBy(mst_1.embankments.displayOrder, mst_1.embankments.name);
        return rows.map(parseEmbankmentNumerics);
    },
    async getById(id) {
        const [emb] = await client_1.db.select()
            .from(mst_1.embankments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.embankments.id, id), (0, drizzle_orm_1.eq)(mst_1.embankments.isActive, true)))
            .limit(1);
        if (!emb)
            throw new error_middleware_1.AppError(404, 'EMBANKMENT_NOT_FOUND', 'Pematang tidak ditemukan');
        return parseEmbankmentNumerics(emb);
    },
    async create(fieldId, input) {
        // Validate field exists
        const [field] = await client_1.db.select({ id: mst_1.fields.id })
            .from(mst_1.fields)
            .where((0, drizzle_orm_1.eq)(mst_1.fields.id, fieldId))
            .limit(1);
        if (!field)
            throw new error_middleware_1.AppError(404, 'FIELD_NOT_FOUND', 'Lahan tidak ditemukan');
        const geomJson = JSON.stringify(input.polygon_geom);
        // Dynamically calculate connected sub-blocks based on polygon overlap
        const connectedSubBlocks = await calculateIntersectingSubBlocks(fieldId, input.polygon_geom);
        const [inserted] = await client_1.db.insert(mst_1.embankments).values({
            fieldId,
            name: input.name,
            code: input.code,
            polygonGeom: geomJson,
            elevationM: input.elevation_m?.toString(),
            soilType: input.soil_type,
            displayOrder: input.display_order,
            notes: input.notes,
            connectedSubBlocks: connectedSubBlocks,
        }).returning();
        if (!inserted)
            throw new error_middleware_1.AppError(500, 'CREATE_FAILED', 'Gagal membuat data pematang');
        return parseEmbankmentNumerics(inserted);
    },
    async update(id, input) {
        const setParts = { updatedAt: new Date() };
        if (input.name !== undefined)
            setParts['name'] = input.name;
        if (input.code !== undefined)
            setParts['code'] = input.code;
        if (input.elevation_m !== undefined)
            setParts['elevationM'] = input.elevation_m?.toString();
        if (input.soil_type !== undefined)
            setParts['soilType'] = input.soil_type;
        if (input.display_order !== undefined)
            setParts['displayOrder'] = input.display_order;
        if (input.notes !== undefined)
            setParts['notes'] = input.notes;
        if (input.polygon_geom !== undefined) {
            setParts['polygonGeom'] = JSON.stringify(input.polygon_geom);
            // Recalculate dynamic overlap
            const [emb] = await client_1.db.select({ fieldId: mst_1.embankments.fieldId })
                .from(mst_1.embankments)
                .where((0, drizzle_orm_1.eq)(mst_1.embankments.id, id))
                .limit(1);
            if (emb) {
                setParts['connectedSubBlocks'] = await calculateIntersectingSubBlocks(emb.fieldId, input.polygon_geom);
            }
        }
        else if (input.connected_sub_blocks !== undefined) {
            setParts['connectedSubBlocks'] = input.connected_sub_blocks;
        }
        const [updated] = await client_1.db.update(mst_1.embankments)
            .set(setParts)
            .where((0, drizzle_orm_1.eq)(mst_1.embankments.id, id))
            .returning();
        if (!updated)
            throw new error_middleware_1.AppError(404, 'EMBANKMENT_NOT_FOUND', 'Pematang tidak ditemukan');
        return parseEmbankmentNumerics(updated);
    },
    /** Bulk import from GeoJSON FeatureCollection */
    async importFromGeoJson(fieldId, input) {
        // Validate field exists
        const [field] = await client_1.db.select({ id: mst_1.fields.id })
            .from(mst_1.fields)
            .where((0, drizzle_orm_1.eq)(mst_1.fields.id, fieldId))
            .limit(1);
        if (!field)
            throw new error_middleware_1.AppError(404, 'FIELD_NOT_FOUND', 'Lahan tidak ditemukan');
        const insertedIds = [];
        for (const feature of input.geojson.features) {
            const props = feature.properties ?? {};
            const name = String(props[input.name_field] ?? `Pematang ${insertedIds.length + 1}`);
            const code = input.code_field ? String(props[input.code_field] ?? '') : undefined;
            const geomJson = JSON.stringify(feature.geometry);
            const connectedSubBlocks = await calculateIntersectingSubBlocks(fieldId, feature.geometry);
            const [inserted] = await client_1.db.insert(mst_1.embankments).values({
                fieldId,
                name,
                code,
                polygonGeom: geomJson,
                connectedSubBlocks: connectedSubBlocks,
            }).returning();
            if (inserted)
                insertedIds.push(inserted.id);
        }
        return { inserted: insertedIds.length, ids: insertedIds };
    },
    async delete(id) {
        await client_1.db.update(mst_1.embankments)
            .set({ isActive: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(mst_1.embankments.id, id));
    },
};
//# sourceMappingURL=master-data.service.js.map