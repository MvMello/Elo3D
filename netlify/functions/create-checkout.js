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
      body: JSON.stringify({ error: 'PAGBANK_TOKEN nao configurado no Netlify.' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const items = body.items;
    const siteUrl = body.siteUrl;

    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Carrinho vazio.' }) };
    }

    const pagbankItems = items.map(function (it) {
      return {
        name: it.name.slice(0, 200),
        quantity: it.qty,
        unit_amount: Math.round(it.price * 100),
      };
    });

    const referenceId = 'ELO3D_' + Date.now();
    const origin = siteUrl || (event.headers.origin || event.headers.referer || '').replace(/\/$/, '');
    const redirectUrl = origin + '/#pedido-confirmado?reference_id=' + referenceId;

    const checkoutPayload = {
      reference_id: referenceId,
      items: pagbankItems,
      customer_modifiable: true,
      redirect_url: redirectUrl,
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

    const response = await fetch(PAGBANK_BASE_URL + '/checkouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
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

    const payLink = (data.links || []).find(function (l) {
      return l.rel === 'PAY';
    });

    if (!payLink) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'PagBank nao retornou link de pagamento.', details: data }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ checkoutUrl: payLink.href, referenceId: referenceId }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falha ao criar checkout', details: String(err) }),
    };
  }
};
