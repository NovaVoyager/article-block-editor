import protocolDefinition from './article-content-protocol-v1.json'
import textFormattingSchema from './text-formatting-v1.schema.json'
import fontSizeSchema from './paragraph-font-size-v1.schema.json'
import imageLayoutSchema from './image-layout-v1.schema.json'
import resourceQuestionSchema from './resource-question-v1.schema.json'
import resourceQuestionImageSchema from './resource-question-image-v1.schema.json'

const anchorSchema = { type: 'string', minLength: 1, pattern: '\\S', description: 'Stable paragraph/heading anchor, unique within the article. New resource option bindings use the external option ID; existing anchors remain valid.' }
const anchorAttribute = { name: 'anchorId', type: 'string', required: false, description: anchorSchema.description }

export const baseDocumentSchema = protocolDefinition.documentSchema

// The validator and downloadable protocol share this exact schema.
export const currentDocumentSchema = {
  ...baseDocumentSchema,
  $id: 'urn:article-content-protocol:v1:with-formatting-extensions',
  title: 'Article Content Protocol v1 + Extensions',
  properties: {
    ...baseDocumentSchema.properties,
    content: { type: 'array', items: { oneOf: [
      { $ref: '#/definitions/blockNode' }, { $ref: '#/definitions/resourceQuestion' },
    ] } },
  },
  definitions: {
    ...baseDocumentSchema.definitions,
    resourceQuestion: resourceQuestionSchema,
    resourceQuestionImage: resourceQuestionImageSchema,
    heading: {
      ...baseDocumentSchema.definitions.heading,
      properties: {
        ...baseDocumentSchema.definitions.heading.properties,
        attrs: {
          ...baseDocumentSchema.definitions.heading.properties.attrs,
          properties: { ...baseDocumentSchema.definitions.heading.properties.attrs.properties, anchorId: anchorSchema },
        },
      },
    },
    image: {
      ...baseDocumentSchema.definitions.image,
      properties: {
        ...baseDocumentSchema.definitions.image.properties,
        attrs: {
          ...baseDocumentSchema.definitions.image.properties.attrs,
          properties: {
            ...baseDocumentSchema.definitions.image.properties.attrs.properties,
            imageLayout: imageLayoutSchema,
          },
        },
      },
    },
    paragraph: {
      ...baseDocumentSchema.definitions.paragraph,
      properties: {
        ...baseDocumentSchema.definitions.paragraph.properties,
        attrs: {
          ...baseDocumentSchema.definitions.paragraph.properties.attrs,
          properties: {
            ...baseDocumentSchema.definitions.paragraph.properties.attrs.properties,
            fontSize: fontSizeSchema,
            anchorId: anchorSchema,
          },
        },
      },
    },
    mark: {
      oneOf: [...baseDocumentSchema.definitions.mark.oneOf, textFormattingSchema],
    },
  },
}

const currentProtocol = {
  ...protocolDefinition,
  id: 'article-content-v1-with-extensions',
  name: currentDocumentSchema.title,
  baseProtocol: { id: protocolDefinition.id, version: protocolDefinition.version },
  extensions: [
    { id: 'text-formatting', version: 1, schemaId: textFormattingSchema.$id },
    { id: 'paragraph-font-size', version: 1, schemaId: fontSizeSchema.$id },
    { id: 'image-layout', version: 1, schemaId: imageLayoutSchema.$id },
    { id: 'resource-question', version: 1, schemaId: resourceQuestionSchema.$id },
    { id: 'paragraph-anchor', version: 1 },
  ],
  nodes: [...protocolDefinition.nodes.map(node => {
    if (node.type === 'heading') return {
      ...node, attributes: [...node.attributes, anchorAttribute],
      render: { ...node.render, attributeBindings: { ...node.render.attributeBindings, anchorId: 'data-anchor-id' } },
    }
    if (node.type === 'paragraph') return {
      ...node,
      attributes: [...node.attributes, anchorAttribute, {
        name: 'fontSize', type: fontSizeSchema.type, required: false,
        description: fontSizeSchema.description,
        minimum: fontSizeSchema.minimum, maximum: fontSizeSchema.maximum,
      }],
      render: {
        ...node.render,
        styleBindings: { ...node.render.styleBindings, fontSize: 'font-size' },
        styleUnits: { fontSize: 'px' },
        attributeBindings: { ...node.render.attributeBindings, anchorId: 'data-anchor-id' },
      },
    }
    if (node.type === 'image') return {
      ...node,
      attributes: [...node.attributes, {
        name: 'imageLayout', type: imageLayoutSchema.type, required: false,
        description: imageLayoutSchema.description, allowedValues: imageLayoutSchema.enum,
      }],
      render: {
        ...node.render,
        attributeBindings: { ...node.render.attributeBindings, imageLayout: 'data-image-layout' },
        layoutNotes: [
          'Constrain display width to the container. When width and height are supplied, scale height proportionally; do not crop the image. Preserve the original dimensions in JSON.',
          'Adjacent sibling images with imageLayout=two-column occupy half a row each, with a gap. Every two images wrap; intervening non-image blocks start a new row. Omit imageLayout for a full-row container.',
          'imageAlign controls horizontal alignment inside the image layout container; omission means center.',
        ],
      },
    }
    return node
  }), {
    type: 'resourceQuestion', description: 'Top-level resource question snapshot. Rendering never fetches resource data.',
    attributes: Object.entries(resourceQuestionSchema.properties.attrs.properties).map(([name, schema]) => ({
      name, type: 'type' in schema ? schema.type : 'object',
      required: resourceQuestionSchema.properties.attrs.required.includes(name),
      description: `See documentSchema.definitions.resourceQuestion.properties.attrs.properties.${name}`,
    })),
    render: { mode: 'component', element: 'resource-question' },
  }],
  resourceQuestionRules: {
    data: 'Save the selected resourceId, title, description and options as a snapshot. Option IDs are stable strings supplied by the resource. Do not fetch on render.',
    image: 'Optional attrs.image={src,alt?,title?,width?,height?} is a snapshot from the resource or a separate upload. Render it above the title, fit width to the container and preserve aspect ratio without cropping. Omit when absent; older documents need no image. Selecting a resource replaces the image (omission clears it); uploading only replaces image, not question/bindings/gate settings.',
    identity: 'Question id, revealKey and paragraph/heading anchorId must each be unique within the document; option id must be unique within its question. Enforce these semantic checks in addition to JSON Schema.',
    draft: 'resourceId="" with empty title, description and options is an unconfigured placeholder. Render a neutral placeholder; never unlock automatically.',
    placement: 'resourceQuestion is allowed only as a direct child of doc.',
    binding: 'New editor bindings set paragraph/heading anchorId and option.targetAnchorId to option.id. Existing documents are not automatically migrated; explicitly rebind/convert to use the option ID. Renaming a target with different-option references or relocating a key referenced by another question is rejected without changing data. Unshared option anchors may move to a new target atomically. Same-ID references to a renamed legacy target are updated together. Clearing a binding keeps its anchor; copies receive fresh anchors. Always preserve targetAnchorId for legacy compatibility.',
    navigation: 'Match the selected option.targetAnchorId to a paragraph or heading in this article instance. Missing/unbound targets do not navigate. After business-controlled reveal, wait for layout before scrolling.',
    visibility: 'Scan top-level nodes in order. Include a resourceQuestion, then stop if hideFollowing=true and its revealKey is absent from the host-supplied revealed keys. Recompute from the original document when keys change. Clicking an option does not automatically unlock.',
    security: 'Visibility is presentation only, not authorization. Hidden article data remains in the JSON; sensitive data must be protected on the server.',
  },
  marks: [
    ...protocolDefinition.marks,
    ...textFormattingSchema.properties.type.enum.map(type => ({
      type,
      description: type === 'textStyle' ? 'Text foreground color.' : 'Text background highlight color.',
      attributes: [{
        name: 'color', type: 'string', required: true,
        description: 'A six-digit hexadecimal CSS color, including the leading #.',
        pattern: textFormattingSchema.properties.attrs.properties.color.pattern,
      }],
      render: {
        mode: 'element', element: type === 'textStyle' ? 'span' : 'mark',
        styleBindings: { color: type === 'textStyle' ? 'color' : 'background-color' },
      },
    })),
  ],
  documentSchema: currentDocumentSchema,
}

/** A detached protocol definition, never the editor's current article. */
export function getCurrentProtocol() {
  return JSON.parse(JSON.stringify(currentProtocol)) as typeof currentProtocol
}
