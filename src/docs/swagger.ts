import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Movie Ticketing API',
      version: '1.0.0',
      description:
        'RESTful API for a Movie Ticketing System. Admins manage movies, screens, and showtimes; customers browse, select seats, and book tickets.',
    },
    servers: [{ url: '/api', description: 'API base path' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'SEAT_UNAVAILABLE' },
                message: { type: 'string' },
                details: { type: 'array', items: {} },
              },
            },
          },
        },
        CreateMovie: {
          type: 'object',
          required: ['title', 'description', 'genre', 'language', 'durationMinutes', 'rating', 'releaseDate'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            genre: { type: 'string' },
            language: { type: 'string' },
            durationMinutes: { type: 'integer' },
            rating: { type: 'string', enum: ['U', 'UA', 'A'] },
            releaseDate: { type: 'string', format: 'date' },
            posterUrl: { type: 'string', format: 'uri' },
            isActive: { type: 'boolean', default: true },
          },
        },
        CreateScreen: {
          type: 'object',
          required: ['name', 'rows', 'seatsPerRow', 'rowTypeMapping'],
          properties: {
            name: { type: 'string' },
            rows: { type: 'integer', minimum: 1, maximum: 26 },
            seatsPerRow: { type: 'integer', minimum: 1, maximum: 50 },
            rowTypeMapping: {
              type: 'object',
              properties: {
                standard: { type: 'array', items: { type: 'string' } },
                premium: { type: 'array', items: { type: 'string' } },
                vip: { type: 'array', items: { type: 'string' } },
              },
              example: { standard: ['A', 'B', 'C'], premium: ['D', 'E'], vip: ['F'] },
            },
          },
        },
        CreateShowtime: {
          type: 'object',
          required: ['movieId', 'screenId', 'startsAt', 'endsAt', 'basePrice'],
          properties: {
            movieId: { type: 'string', format: 'uuid' },
            screenId: { type: 'string', format: 'uuid' },
            startsAt: { type: 'string', format: 'date-time' },
            endsAt: { type: 'string', format: 'date-time' },
            basePrice: { type: 'number', minimum: 0 },
          },
        },
      },
    },
  },
  apis: ['./src/modules/**/*.router.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
