import protocolDefinition from './article-content-protocol-v1.json'
import textFormattingSchema from './text-formatting-v1.schema.json'
import fontSizeSchema from './paragraph-font-size-v1.schema.json'
import imageLayoutSchema from './image-layout-v1.schema.json'

export const baseDocumentSchema = protocolDefinition.documentSchema

// The validator and downloadable protocol share this exact schema.
export const currentDocumentSchema = {
  ...baseDocumentSchema,
  $id: 'urn:article-content-protocol:v1:with-formatting-extensions',
  title: 'Article Content Protocol v1 + Extensions',
  definitions: {
    ...baseDocumentSchema.definitions,
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
  ],
  nodes: protocolDefinition.nodes.map(node => {
    if (node.type === 'paragraph') return {
      ...node,
      attributes: [...node.attributes, {
        name: 'fontSize', type: fontSizeSchema.type, required: false,
        description: fontSizeSchema.description,
        minimum: fontSizeSchema.minimum, maximum: fontSizeSchema.maximum,
      }],
      render: {
        ...node.render,
        styleBindings: { ...node.render.styleBindings, fontSize: 'font-size' },
        styleUnits: { fontSize: 'px' },
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
  }),
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
