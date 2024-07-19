const PageNotFoundContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  text-align: center;
  background-color: #f9f9f9;
  color: #333;
`;

const Heading = styled.h1`
  font-size: 3rem;
  margin: 0;
`;

const Subheading = styled.p`
  font-size: 1.5rem;
  margin: 1rem 0;
`;

const HomeLink = styled.a`
  font-size: 1rem;
  color: #007bff;
  text-decoration: none;
  margin-top: 2rem;

  &:hover {
    text-decoration: underline;
  }
`;

return (
    <PageNotFoundContainer>
        <Heading>404</Heading>
        <Subheading>Page Not Found</Subheading>
        <HomeLink href={`${REPL_ACCOUNT_ID}/widget/QueryApi.Dashboard`}>Go back to Home</HomeLink>
    </PageNotFoundContainer>
);
