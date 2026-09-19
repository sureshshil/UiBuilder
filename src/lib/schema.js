"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UIRootSchema = exports.UIElementSchema = void 0;
var zod_1 = require("zod");
// We define a recursive schema using z.lazy
var UIElementBaseSchema = zod_1.z.object({
    id: zod_1.z.string().describe('Unique identifier for this node'),
    type: zod_1.z.enum([
        'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'button', 'input', 'img', 'a', 'ul', 'li', 'svg', 'path'
    ]).describe('The HTML tag or component type to render'),
    props: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean(), zod_1.z.object({ type: zod_1.z.string(), key: zod_1.z.string(), value: zod_1.z.string() })])).optional().describe('HTML properties (e.g. placeholder, src, href, onClick)'),
    styles: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional().describe('Inline CSS styles mapped to camelCase React properties (e.g. backgroundColor)'),
    content: zod_1.z.string().optional().describe('Text content if this is a text-only node'),
});
// Gemini Structured Outputs silently drop fields if they contain z.any() or are recursive.
// We must use a strictly defined fixed-depth schema.
// Level 5 has no children property.
var UIElementLevel5 = UIElementBaseSchema;
var UIElementLevel4 = UIElementBaseSchema.extend({ children: zod_1.z.array(UIElementLevel5).optional() });
var UIElementLevel3 = UIElementBaseSchema.extend({ children: zod_1.z.array(UIElementLevel4).optional() });
var UIElementLevel2 = UIElementBaseSchema.extend({ children: zod_1.z.array(UIElementLevel3).optional() });
var UIElementLevel1 = UIElementBaseSchema.extend({ children: zod_1.z.array(UIElementLevel2).optional() });
exports.UIElementSchema = UIElementLevel1;
exports.UIRootSchema = zod_1.z.object({
    // Use strict union instead of z.unknown() for records to guarantee valid JSON Schema
    state: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean()])).optional().describe('Initial state variables for the component'),
    tree: exports.UIElementSchema.describe('The root UI element of the component. Must contain deeply nested children if needed.'),
});
