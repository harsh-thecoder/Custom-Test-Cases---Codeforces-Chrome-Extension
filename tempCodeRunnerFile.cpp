#include<bits/stdc++.h>
using namespace std;
#define ll long long

int main()
{
    ll t = 1;
    while(t--)
    {
        ll n;
        cin>>n;
        ll arr[n];
        vector <bool> visited(n+1,0);
        for(ll i=0;i<n;i++)
        {
            cin>>arr[i];
            visited[arr[i]] = 1;
        }

        set <ll> st;
        for(ll i=1;i<=n;i++)
        {
            if(!visited[i])
            {
                st.insert(i);
            }
        }

        vector <ll> ans(n+1,0);
        for(ll i=0;i<n;i++)
        {
            if(arr[i] == 0)
            {
                ll val = *st.rbegin();
                if(val == i+1)
                {
                    val = *st.begin();
                }
                st.erase(st.find(val));
                ans[i] = val;
            }
            else
            {
                ans[i] = arr[i];
            }
        }

        bool check = 1;
        for(ll i=0;i<n;i++)
        {
            if(ans[i] == i+1)
            {
                check = 0;
                break;
            }
        }  

        if(check)
        {
            for(ll i=0;i<n;i++)
            {
                cout<<ans[i]<<" ";
            }
            cout<<endl;
            continue;
        }

        st.clear();
        for(ll i=1;i<=n;i++)
        {
            if(!visited[i])
            {
                st.insert(i);
            }
        }


        for(ll i=0;i<n;i++)
        {
            if(arr[i] == 0)
            {
                ll val = *st.begin();
                if(val == i+1)
                {
                    val = *st.rbegin();
                }
                st.erase(st.find(val));
                ans[i] = val;
            }
            else
            {
                ans[i] = arr[i];
            }
        }

            for(ll i=0;i<n;i++)
            {
                cout<<ans[i]<<" ";
            }
            cout<<endl;

        
    }
}