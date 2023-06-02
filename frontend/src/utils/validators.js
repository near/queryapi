const CONTRACT_NAME_REGEX = RegExp(/^(\*|([a-z\d]+[-_])*[a-z\d]+)(\.*(\*|([a-z\d]+[-_])*[a-z\d]+))*\.(testnet|near)$/)

export function validateContractId(accountId) {
  return (
    accountId.length >= 2 &&
    accountId.length <= 64 &&
    CONTRACT_NAME_REGEX.test(accountId)
  );
}

