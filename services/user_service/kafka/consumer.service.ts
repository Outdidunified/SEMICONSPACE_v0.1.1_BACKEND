// This file is part of the SEMICONSPACE project.
import { Injectable } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { AddressService } from '../modules/address/address.service'; // Import AddressService
import { Profile } from '../models/profile.model'; // ✅ Import Profile model

@Injectable()
export class ConsumerService {
  private kafka = new Kafka({
    clientId: 'user-service-consumer',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  });

  private consumer = this.kafka.consumer({ groupId: 'user-service' });

  constructor(private readonly addressService: AddressService) {}

  async startConsumer() {
    const topics = ['user.registered']; // Listening to the 'user.registered' topic

    try {
      console.log('🔌 Connecting to Kafka...');
      await this.consumer.connect();

      for (const topic of topics) {
        await this.consumer.subscribe({ topic, fromBeginning: true });
        console.log(`Subscribed to topic: ${topic}`);
      }

      await this.consumer.run({
  eachMessage: async ({ topic, message }) => {
    if (!message.value) {
      console.warn('Received empty Kafka message');
      return;
    }

    try {
      const payload = JSON.parse(message.value.toString());
      console.log('Parsed Kafka payload:', payload);

      // ✅ Adjust for wrapped payload
      const data = payload.data;

 if (topic === 'user.registered' && data?.userId) {
  console.log('👀 Received created_by:', data.created_by); // log first

  const exists = await Profile.findByPk(data.userId);
  if (!exists) {
    const profilePayload = {
      userId: data.userId,
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      email: data.email || '',
      phone: data.phone || '',
      password: data.password || '',
      role: data.role || '',
      role_id: data.role_id || 0,
      status: data.status ?? true,
      created_by: data.created_by || 'system',
      created_at: data.created_at ? new Date(data.created_at) : new Date(),
      modified_by: data.modified_by || null,
      modified_date: data.modified_at ? new Date(data.modified_at) : null,
    };

    console.log('📦 Inserting profile:', profilePayload);

    const newProfile = await Profile.create(profilePayload);
    console.log('✅ Profile created in DB:', newProfile.toJSON());
  } else {
    console.log(`ℹ️ Profile already exists for user: ${data.userId}`);
  }
}


    } catch (err) {
      console.error('Failed to process Kafka message:', err.message);
    }
  },
});


      console.log('Kafka consumer running...');
    } catch (err) {
      console.error('Kafka Consumer failed to start:', err.message);
    }
  }
  
}
