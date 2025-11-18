import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('MONGO_URI');

        if (!uri) {
          console.error('❌ MONGO_URI no está definido en el archivo .env');
          process.exit(1);
        }

        return {
          uri,
          connectionFactory: (connection) => {
            connection.on('connected', () => {
              console.log('✅ MongoDB conectado correctamente');
            });

            connection.on('error', (error) => {
              console.error('❌ Error en la conexión a MongoDB:', error);
            });

            connection.on('disconnected', () => {
              console.log('⚠️ MongoDB desconectado');
            });

            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}