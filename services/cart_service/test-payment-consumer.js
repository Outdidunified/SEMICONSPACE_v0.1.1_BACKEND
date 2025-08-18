const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: ['172.235.17.60:9092']
});

const producer = kafka.producer();

async function testPaymentConsumer() {
  await producer.connect();
  
  const paymentMessage = {
    success: true,
    message: "Payment confirmed successfully",
    data: {
      orderId: "78ad0ed7-3d99-4906-9692-882c1f45722f",
      userId: "17e32af2-95b1-4129-bd33-e57caf67d5bc",
      paymentId: "pay_MOCK987654321",
      razorpayOrderId: "order_R2umWZywPviyxu",
      total: 53039.98,
      status: "success",
      createdAt: "2025-08-08T16:59:44.525Z",
      items: [
        {
          productId: "2222",
          qty: 2,
          totalprice: 51998
        },
        {
          productId: "2235",
          qty: 2,
          totalprice: 401.98
        }
      ]
    }
  };

  await producer.send({
    topic: 'payment.success',
    messages: [
      { value: JSON.stringify(paymentMessage) }
    ]
  });

  console.log('✅ Test payment message sent to payment.success topic');
  await producer.disconnect();
}

testPaymentConsumer().catch(console.error);
