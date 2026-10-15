import Fastify, { FastifyInstance } from 'fastify';                                         
    import cors from '@fastify/cors';
    import fastifySwagger from '@fastify/swagger';
    import fastifySwaggerUi from '@fastify/swagger-ui';                                           
    import { env } from './config/index.js';         
                                                     
    export async function buildApp(): Promise<FastifyInstance> {                         
      const app = Fastify({                          
        logger: {                                    
          level: env.LOG_LEVEL,                  
          transport:                                 
            env.NODE_ENV === 'development'           
              ? {                                    
                  target: 'pino-pretty',             
                  options: {                         
                    translateTime: 'HH:MM:ss Z',     
                    ignore: 'pid,hostname',          
                  },                                 
                }                                    
              : undefined,                           
        },                                           
      });                                            
                                                     
      // Enable CORS                                 
      await app.register(cors, {                     
        origin: [env.GUEST_APP_URL, env.             
  DASHBOARD_APP_URL, 'http://localhost:5173',        
  'http://localhost:5174'],                          
        credentials: true,                           
      });                                            
                                                     
      // Register OpenAPI / Swagger specification generator                                          
      await app.register(fastifySwagger, {           
        openapi: {                                   
          info: {                                    
            title: 'ConciergeIQ API',                
            description: 'Multi-tenant Guest Experience CRM and Digital Concierge REST API',    
            version: '0.1.0',                        
          },                                         
          servers: [                                 
            {                                        
              url: `http://localhost:${env.PORT}`,   
              description: 'Current Environment',    
            },                                       
          ],                                         
          tags: [                                    
            { name: 'System', description: 'System health and diagnostic endpoints' },                
          ],                                         
        },                                           
      });                                            
                                                     
      // Register Swagger UI interface at /docs      
      await app.register(fastifySwaggerUi, {         
        routePrefix: '/docs',                        
        uiConfig: {                                  
          docExpansion: 'list',                      
          deepLinking: false,                        
        },                                           
        staticCSP: true,                                   
      });                                            
                                                     
      // Root endpoint                               
      app.get('/', {                                 
        schema: {                                    
          description: 'Root endpoint providingservice status and documentation link',            
          tags: ['System'],                          
          response: {                                
            200: {                                   
              type: 'object',                        
              properties: {                          
                message: { type: 'string' },         
                status: { type: 'string' },          
                docs: { type: 'string' },            
              },                                     
            },                                       
          },                                         
        },                                           
      }, async () => {                               
        return {                                     
          message: 'Welcome to ConciergeIQ API',     
          status: 'online',                          
          docs: '/docs',                             
        };                                           
      });                                            
                                                     
      // Health check endpoint                       
      app.get('/api/health', {                       
        schema: {                                    
          description: 'System health check and diagnostic information',                           
          tags: ['System'],                          
          response: {                                
            200: {                                   
              type: 'object',                        
              properties: {                          
                status: { type: 'string' },          
                service: { type: 'string' },         
                version: { type: 'string' },         
                timestamp: { type: 'string' },       
                uptimeSeconds: { type: 'number' },   
              },                                     
            },                                       
          },                                         
        },                                           
      }, async () => {                               
        return {                                     
          status: 'ok',                              
          service: 'ConciergeIQ API',                
          version: '0.1.0',
          timestamp: new Date().toISOString(),       
          uptimeSeconds: Math.floor(process.uptime()),
        };
      });
  
      return app;
    }
