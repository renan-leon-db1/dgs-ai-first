import argparse
import json
import os
import random
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, List

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

NO_ANSWER_SENTENCE = "Nao encontrei informacao suficiente na base documental fornecida."
CITATION_PATTERN = re.compile(r"\[FONTE:\s*[^\]]+\]", re.IGNORECASE)


@dataclass
class EvalResult:
    case_id: str
    passed: bool
    checks: Dict[str, bool]
    response: str


def load_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def load_json(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_user_message(case: Dict[str, Any]) -> str:
    chunks = "\n".join(f"- {c}" for c in case["context_chunks"])
    return (
        "Contexto recuperado:\n"
        f"{chunks}\n\n"
        "Pergunta do atendente:\n"
        f"{case['question']}"
    )


def call_llm_real(system_prompt: str, user_message: str, model: str) -> str:
    if OpenAI is None:
        raise RuntimeError(
            "Pacote 'openai' nao encontrado. Instale com: pip install openai"
        )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Defina OPENAI_API_KEY para executar em modo real.")

    base_url = os.getenv("OPENAI_BASE_URL")
    client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0,
    )
    return response.choices[0].message.content or ""


def call_llm_mock(case: Dict[str, Any]) -> str:
    # Mock simples para demonstrar o pipeline de avaliacao sem dependencia de API.
    if case.get("expect_no_answer", False):
        return (
            f"{NO_ANSWER_SENTENCE}\n"
            "Sugiro escalar para o supervisor.\n"
            "[FONTE: PROC-042v2-B]"
        )

    if "Platinum" in case["question"] or "platinum" in case["question"].lower():
        return (
            "Nao existe tier Platinum na NovaTech; os tiers validos sao Gold, Silver e Standard.\n"
            "[FONTE: SLA-2024-A]\n"
            "[FONTE: FAQ-15]"
        )

    # Resposta default para casos com cobertura.
    return (
        "Para cliente Gold em chamados gerais, o prazo de resposta e ate 2h uteis e a resolucao ate 24h uteis.\n"
        "[FONTE: SLA-2024-B]"
    )


def evaluate_case(case: Dict[str, Any], response: str) -> EvalResult:
    text_lower = response.lower()
    forbidden_terms = [t.lower() for t in case.get("forbidden_terms", [])]

    checks = {
        "has_citation": bool(CITATION_PATTERN.search(response)),
        "no_forbidden_terms": not any(term in text_lower for term in forbidden_terms),
        "no_answer_rule": True,
    }

    if case.get("expect_no_answer", False):
        checks["no_answer_rule"] = NO_ANSWER_SENTENCE.lower() in text_lower

    passed = all(checks.values())
    return EvalResult(case_id=case["id"], passed=passed, checks=checks, response=response)


def print_report(results: List[EvalResult]) -> int:
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed

    print("=" * 80)
    print("PROMPT EVAL REPORT")
    print("=" * 80)
    print(f"Total: {total} | Passed: {passed} | Failed: {failed}")

    for r in results:
        status = "PASS" if r.passed else "FAIL"
        print("-" * 80)
        print(f"{status} | {r.case_id}")
        print(f"Checks: {r.checks}")
        print("Response:")
        print(r.response)

    return 0 if failed == 0 else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Avaliador automatizado de prompt/harness")
    parser.add_argument(
        "--prompt-file",
        default="../prompts/novatech_assistente_atendimento.v1.md",
        help="Caminho para o system prompt",
    )
    parser.add_argument(
        "--cases-file",
        default="../tests/prompt_eval_cases.json",
        help="Caminho para os casos de teste",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        help="Modelo para execucao real",
    )
    parser.add_argument(
        "--mode",
        choices=["mock", "real"],
        default="mock",
        help="mock = sem API, real = chama LLM via OpenAI-compatible API",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Semente para reproducibilidade",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    random.seed(args.seed)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    prompt_path = os.path.abspath(os.path.join(base_dir, args.prompt_file))
    cases_path = os.path.abspath(os.path.join(base_dir, args.cases_file))

    system_prompt = load_text(prompt_path)
    cases = load_json(cases_path)

    results: List[EvalResult] = []

    for case in cases:
        user_message = build_user_message(case)
        if args.mode == "real":
            response = call_llm_real(system_prompt, user_message, args.model)
        else:
            response = call_llm_mock(case)

        results.append(evaluate_case(case, response))

    return print_report(results)


if __name__ == "__main__":
    sys.exit(main())
