"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CadastreController = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const cadastre_service_1 = require("./cadastre.service");
let CadastreController = class CadastreController {
    cadastreService;
    constructor(cadastreService) {
        this.cadastreService = cadastreService;
    }
    analyze(code) {
        return this.cadastreService.analyze(code);
    }
};
exports.CadastreController = CadastreController;
__decorate([
    (0, common_1.Sse)('analyze'),
    __param(0, (0, common_1.Query)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", rxjs_1.Observable)
], CadastreController.prototype, "analyze", null);
exports.CadastreController = CadastreController = __decorate([
    (0, common_1.Controller)('cadastre'),
    __metadata("design:paramtypes", [cadastre_service_1.CadastreService])
], CadastreController);
//# sourceMappingURL=cadastre.controller.js.map