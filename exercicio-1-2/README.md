# Entregaveis — Exercicio 1.2

## Conteudo

- `exercicio-1-2-estrategia.md`: estrategia de prompt/context engineering + enforcement.
- `prompts/novatech_assistente_atendimento.v1.md`: system prompt inicial.
- `tests/prompt_eval_cases.json`: casos de teste baseados no Anexo B.
- `scripts/prompt_eval.py`: avaliador automatizado (mock e real).

## Como executar (modo mock)

```bash
cd scripts
python prompt_eval.py --mode mock
```

## Como executar (modo real)

1. Instalar dependencia:

```bash
pip install openai
```

2. Definir variaveis de ambiente:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (opcional, padrao: `gpt-4o-mini`)
- `OPENAI_BASE_URL` (opcional, para endpoints OpenAI-compativeis como Azure)

3. Executar:

```bash
cd scripts
python prompt_eval.py --mode real
```

## Criterios avaliados

- Presenca de citacao de fonte no formato `[FONTE: ...]`
- Ausencia de termos proibidos por caso
- Cumprimento da regra de "nao encontrei" para perguntas sem cobertura
