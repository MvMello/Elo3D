// netlify/functions/create-checkout.js
//
// Cria um "Checkout" na API do PagBank (UOL/PagSeguro) e devolve o link de
// pagamento pro navegador redirecionar o cliente.
//
// Requer a variável de ambiente PAGBANK_TOKEN configurada no painel do Netlify
// (Site settings > Environment variables). Nunca coloque o token direto no
// código do site — ele fica só aqui, do lado do servidor.
//
// Docs oficiais: https://developer.pagbank.com.br/reference/criar-checkout

const PAGBANK_BASE_URL = process.env.PAGBANK_SANDBOX === 'true'
  ? 'https://sandbox.api.pagseguro.com'
  : 'https://api.pagseguro.com';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.PAGBANK_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'PAGBANK_TOKEN não configurado no Netlify.' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { items, siteUrl } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Carrinho vazio.' }) };
    }

    const pagbankItems = items.map((it) => ({
      name: it.name.slice(0, 200),
      quantity: it.qty,
      unit_amount: Math.round(it.price * 100),
    }));

    const referenceId = 'ELO3D_' + Date.now();
    const origin = siteUrl || (event.headers.origin || event.headers.referer || '').replace(/\/$/, '');

    const checkoutPayload = {
      reference_id: referenceId,
      items: pagbankItems,
      customer_modifiable: true,
      redirect_url: ${origin}/#pedido-confirmado?reference_id=${referenceId},
      payment_methods: [
        { type: 'CREDIT_CARD' },
        { type: 'DEBIT_CARD' },
        { type: 'PIX' },
        { type: 'BOLETO' },
      ],
      payment_methods_configs: [
        {
          type: 'CREDIT_CARD',
          config_options: [
            { option: 'INSTALLMENTS_LIMIT', value: '12' },
          ],
        },
      ],
    };

    const response = await fetch(${PAGBANK_BASE_URL}/checkouts, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: Bearer ${token},
      },
      body: JSON.stringify(checkoutPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Erro do PagBank', details: data }),
      };
    }

    const payLink = (data.links || []).find((l) => l.rel === 'PAY');

    if (!payLink) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'PagBank não retornou link de pagamento.', details: data }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ checkoutUrl: payLink.href, referenceId }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falha ao criar checkout', details: String(err) }),
    };
  }
};
