import logo from '../../assets/corvex-logo.png';
import whiteLogo from '../../assets/corvex-white-logo.png';

export function Wordmark() {
  return (
    <span className="cvx-wordmark">
      <img src={whiteLogo} alt="" className="cvx-wordmark-mark cvx-wordmark-mark--light" />
      <img src={logo} alt="" className="cvx-wordmark-mark cvx-wordmark-mark--dark" />
      <span className="cvx-wordmark-bar" aria-hidden="true" />
      <span className="cvx-wordmark-type">CORVEX</span>
    </span>
  );
}
