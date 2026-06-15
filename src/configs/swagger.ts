import path from 'node:path';
import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'DMFT Survey API',
      version: '1.0.0',
      description:
        'Local backend API for the DMFT baseline survey collection tool.',
    },
    servers: [
      {
        url: '/',
        description: 'API root (paths include /api/v1 prefix)',
      },
    ],
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            status: { type: 'integer', example: 400 },
            timestamp: { type: 'string', format: 'date-time' },
            cache: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                title: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Invalid request payload.' },
                errors: { type: 'array', items: { type: 'object' } },
                meta: { type: 'object', additionalProperties: true },
              },
            },
            requestId: { type: 'string' },
          },
        },
      },
    },
  },
  apis: [path.resolve(process.cwd(), 'src/modules/**/*.router.ts')],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
