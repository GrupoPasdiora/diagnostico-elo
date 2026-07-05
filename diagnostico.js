// Função serverless da Vercel — o "porteiro" que esconde a chave da OpenAI.
// A chave NUNCA aparece no site. Ela fica na variável de ambiente OPENAI_API_KEY,
// configurada no painel da Vercel (Settings > Environment Variables).

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

const SYSTEM_PROMPT = `Você é uma estrategista sênior de posicionamento de marca e Instagram para mulheres empreendedoras brasileiras (contexto do método ELO — Essência, Liderança, Organização). Seu trabalho é transformar as respostas de um questionário (e, quando houver, o print do perfil no Instagram) em um diagnóstico PRÁTICO, específico e acolhedor.

Regras:
- Responda SEMPRE em português do Brasil, com tom caloroso e direto, tratando a pessoa por "você".
- Seja específica ao negócio dela. NADA de conselho genérico. Use as palavras e o nicho dela.
- Se houver imagem do perfil, analise de verdade o que dá pra ver: foto, nome/@, bio, destaques, feed, cores, coerência visual. Aponte 2 a 4 observações concretas.
- A bio deve estar PRONTA para copiar e colar, com quebras de linha reais e emojis coerentes com o tom.
- Cores: escolha uma paleta de 4 cores em HEX que traduza o sentimento desejado.
- Correções: só as que fazem sentido pelas respostas; no máximo 5.

Devolva EXCLUSIVAMENTE um JSON válido (sem texto fora do JSON) neste formato exato:
{
  "frase": "o posicionamento dela em uma frase",
  "analise_print": "2 a 4 frases analisando o print. Se não houver print, oriente gentilmente a enviar um para uma análise mais precisa.",
  "bio": "bio pronta, com \\n entre as linhas e emojis",
  "destaques": ["Nome do destaque 1", "Nome do destaque 2", "..."],
  "pilares": [{"titulo": "Nome do pilar", "desc": "o que postar nele, com exemplos ligados ao nicho dela"}],
  "paleta": {"titulo": "Nome da paleta", "msg": "por que combina com ela e como usar", "cores": [["#RRGGBB", "Nome da cor"]]},
  "correcoes": [{"titulo": "Correção", "desc": "o que fazer, concreto"}],
  "passos": ["passo prático 1", "passo prático 2", "passo prático 3"]
}
Use de 4 a 6 destaques, exatamente 4 pilares e 4 cores.`;

export default async function handler(req, res) {
  // CORS básico (permite abrir de outros domínios se você quiser)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido' }); return; }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'A chave OPENAI_API_KEY não está configurada nas variáveis de ambiente da Vercel.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const answers = body.answers || {};
    const image = body.image || null;

    const resumo = [
      `Nome/marca: ${answers.nome || '(não informado)'}`,
      `O que faz/vende: ${answers.oquefaz || '(não informado)'}`,
      `Para quem (cliente ideal): ${answers.paraquem || '(não informado)'}`,
      `Transformação que gera: ${answers.transformacao || '(não informado)'}`,
      `Como quer ser percebida: ${answers.sentimento || '(não informado)'}`,
      `Tom de voz: ${answers.tom || '(não informado)'}`,
      `Erros que admite cometer hoje: ${(answers.erros && answers.erros.length) ? answers.erros.join(', ') : 'nenhum marcado'}`,
      `Objetivo principal: ${answers.objetivo || '(não informado)'}`
    ].join('\n');

    const userText = `Aqui estão as respostas do questionário desta empreendedora:\n\n${resumo}\n\n${image ? 'Segue também o print do perfil dela no Instagram — analise a imagem.' : 'Ela não enviou print do perfil.'}\n\nGere o diagnóstico completo no formato JSON pedido.`;

    const content = [{ type: 'text', text: userText }];
    if (image && typeof image === 'string' && image.startsWith('data:image')) {
      content.push({ type: 'image_url', image_url: { url: image } });
    }

    const payload = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1800
    };

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: (data.error && data.error.message) || 'Erro ao chamar a OpenAI' });
      return;
    }

    const txt = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '{}';
    let parsed;
    try { parsed = JSON.parse(txt); }
    catch (e) { res.status(502).json({ error: 'A IA retornou um formato inesperado. Tente novamente.' }); return; }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
