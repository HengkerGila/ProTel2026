"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFieldAccess = requireFieldAccess;
exports.requireSystemRole = requireSystemRole;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const mst_1 = require("../db/schema/mst");
const error_middleware_1 = require("../middleware/error.middleware");
// ---------------------------------------------------------------------------
// requireFieldAccess — RBAC per field
//
// Factory middleware: cek apakah user punya field role yang cukup.
// system_admin selalu lolos. field_manager dan operator dibatasi per field.
//
// Cara pakai:
//   router.get('/:fieldId/...', requireAuth, requireFieldAccess('operator'), handler)
//
// Field ID diambil dari req.params.fieldId (atau req.params.id sebagai fallback).
// ---------------------------------------------------------------------------
const ROLE_ORDER = ['viewer', 'operator', 'manager'];
function requireFieldAccess(minRole = 'viewer') {
    return async (req, _res, next) => {
        try {
            const user = req.user;
            if (!user) {
                next(new error_middleware_1.AppError(401, 'UNAUTHORIZED', 'Autentikasi diperlukan'));
                return;
            }
            // system_admin punya akses penuh ke semua field
            if (user.role === 'system_admin') {
                req.fieldRole = 'manager';
                next();
                return;
            }
            let fieldId = req.params['fieldId'] ?? req.body?.field_id ?? req.body?.fieldId;
            if (!fieldId) {
                const id = req.params['id'];
                if (id) {
                    const url = req.originalUrl;
                    if (url.includes('/sub-blocks/')) {
                        const [sb] = await client_1.db
                            .select({ fieldId: mst_1.subBlocks.fieldId })
                            .from(mst_1.subBlocks)
                            .where((0, drizzle_orm_1.eq)(mst_1.subBlocks.id, id))
                            .limit(1);
                        if (!sb) {
                            next(new error_middleware_1.AppError(404, 'SUB_BLOCK_NOT_FOUND', 'Petak tidak ditemukan'));
                            return;
                        }
                        fieldId = sb.fieldId;
                    }
                    else if (url.includes('/devices/')) {
                        const [dev] = await client_1.db
                            .select({ fieldId: mst_1.devices.fieldId })
                            .from(mst_1.devices)
                            .where((0, drizzle_orm_1.eq)(mst_1.devices.id, id))
                            .limit(1);
                        if (!dev) {
                            next(new error_middleware_1.AppError(404, 'DEVICE_NOT_FOUND', 'Perangkat tidak ditemukan'));
                            return;
                        }
                        fieldId = dev.fieldId;
                    }
                    else if (url.includes('/flow-paths/')) {
                        const [fp] = await client_1.db
                            .select({ fieldId: mst_1.flowPaths.fieldId })
                            .from(mst_1.flowPaths)
                            .where((0, drizzle_orm_1.eq)(mst_1.flowPaths.id, id))
                            .limit(1);
                        if (!fp) {
                            next(new error_middleware_1.AppError(404, 'FLOW_PATH_NOT_FOUND', 'Flow path tidak ditemukan'));
                            return;
                        }
                        fieldId = fp.fieldId;
                    }
                    else if (url.includes('/irrigation-points/')) {
                        const [ip] = await client_1.db
                            .select({ fieldId: mst_1.irrigationPoints.fieldId })
                            .from(mst_1.irrigationPoints)
                            .where((0, drizzle_orm_1.eq)(mst_1.irrigationPoints.id, id))
                            .limit(1);
                        if (!ip) {
                            next(new error_middleware_1.AppError(404, 'IRRIGATION_POINT_NOT_FOUND', 'Titik irigasi tidak ditemukan'));
                            return;
                        }
                        fieldId = ip.fieldId;
                    }
                    else {
                        fieldId = id;
                    }
                }
            }
            if (!fieldId) {
                next(new error_middleware_1.AppError(400, 'FIELD_ID_REQUIRED', 'Field ID tidak ditemukan di request'));
                return;
            }
            const [access] = await client_1.db
                .select({ fieldRole: mst_1.userFields.fieldRole })
                .from(mst_1.userFields)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(mst_1.userFields.userId, user.id), (0, drizzle_orm_1.eq)(mst_1.userFields.fieldId, fieldId)))
                .limit(1);
            if (!access) {
                next(new error_middleware_1.AppError(403, 'FIELD_ACCESS_DENIED', 'Tidak ada akses ke field ini'));
                return;
            }
            const userRoleIdx = ROLE_ORDER.indexOf(access.fieldRole);
            const minRoleIdx = ROLE_ORDER.indexOf(minRole);
            if (userRoleIdx < minRoleIdx) {
                next(new error_middleware_1.AppError(403, 'INSUFFICIENT_ROLE', `Diperlukan setidaknya role '${minRole}' untuk aksi ini`));
                return;
            }
            req.fieldRole = access.fieldRole;
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
// ---------------------------------------------------------------------------
// requireSystemRole — cek system_role (system_admin / field_manager / operator)
//
// Dipakai untuk endpoint admin-only, tanpa field scope.
// Cara pakai:
//   router.post('/admin/users', requireAuth, requireSystemRole('system_admin'), handler)
// ---------------------------------------------------------------------------
function requireSystemRole(...roles) {
    return (req, _res, next) => {
        const user = req.user;
        if (!user) {
            next(new error_middleware_1.AppError(401, 'UNAUTHORIZED', 'Autentikasi diperlukan'));
            return;
        }
        if (!roles.includes(user.role)) {
            next(new error_middleware_1.AppError(403, 'FORBIDDEN', `Aksi ini hanya untuk: ${roles.join(', ')}`));
            return;
        }
        next();
    };
}
//# sourceMappingURL=rbac.middleware.js.map