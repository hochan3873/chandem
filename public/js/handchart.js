import { cardsHTML } from './cards.js';

const ROWS = [
  ['로열 플러시', '같은 무늬의 10·J·Q·K·A. 가장 높은 족보예요.', ['As', 'Ks', 'Qs', 'Js', 'Ts']],
  ['스트레이트 플러시', '같은 무늬로 숫자 5장이 연속.', ['9h', '8h', '7h', '6h', '5h']],
  ['포카드', '같은 숫자 4장.', ['Qs', 'Qh', 'Qd', 'Qc', '7s']],
  ['풀 하우스', '같은 숫자 3장 + 같은 숫자 2장. 3장 쪽 숫자를 먼저 비교해요.', ['Kh', 'Kd', 'Kc', '4s', '4h']],
  ['플러시', '같은 무늬 5장. 가장 높은 카드부터 차례로 비교해요.', ['Ad', 'Jd', '9d', '6d', '3d']],
  ['스트레이트', '무늬와 상관없이 숫자 5장이 연속. A-2-3-4-5가 가장 낮아요.', ['Ts', '9d', '8c', '7h', '6s']],
  ['트리플', '같은 숫자 3장.', ['8s', '8h', '8d', 'Kc', '2s']],
  ['투 페어', '페어 2개. 높은 페어 → 낮은 페어 → 키커 순서로 비교해요.', ['Js', 'Jd', '5c', '5h', 'As']],
  ['원 페어', '같은 숫자 2장.', ['Ah', 'Ad', 'Ks', '9c', '4d']],
  ['하이 카드', '아무 족보도 없을 때. 가장 높은 카드로 비교해요.', ['Ac', 'Qd', '9s', '6h', '3c']],
];

export function handChartHTML() {
  return `
  <div class="chart">
    <p class="chart-intro">내 카드 2장과 바닥 카드 5장, 총 7장 중에서 <b>가장 좋은 5장</b>으로 승부해요. 위쪽이 더 높은 족보예요.</p>
    <ol class="chart-list">
      ${ROWS.map(([name, desc, cards], i) => `
        <li class="chart-row">
          <div class="chart-head"><span class="chart-rank">${i + 1}</span><b>${name}</b></div>
          <div class="chart-cards">${cardsHTML(cards, { size: 'sm' })}</div>
          <p class="chart-desc">${desc}</p>
        </li>`).join('')}
    </ol>
    <div class="chart-note">
      <b>동률일 때는 키커로 승부!</b>
      <p>족보가 같으면 족보에 쓰이지 않은 나머지 카드(키커)를 높은 것부터 비교해요.
      예) 둘 다 A 원 페어라면 A A <b>K</b> 가 A A <b>Q</b> 를 이겨요.</p>
      <p>5장이 모두 같은 숫자면 무늬와 상관없이 비겨서 팟을 똑같이 나눠요.</p>
    </div>
  </div>`;
}
